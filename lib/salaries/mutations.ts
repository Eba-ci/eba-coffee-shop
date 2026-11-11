// lib/salaries/mutations.ts
//
// Écritures du module salaires (aucune surface UI ici : les écrans arrivent
// dans les issues suivantes). Enregistrement des versements IDEMPOTENT : un
// double clic rejoué avec la même clé et le MÊME contenu renvoie le versement
// existant ; un contenu différent lève un conflit.

import { SALARY_END_AFTER_START_MESSAGE } from '@/config/constants';
import { Prisma } from '@/generated/prisma/client';
import type { SalaryPaymentType } from '@/generated/prisma/enums';
import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  salaryPaymentCreateSchema,
  salaryRateCreateSchema,
} from '@/lib/schemas/salary';
import { formatLocalDateOnly, parseDateOnlyToUTC } from '@/lib/timezone';
import {
  assertSameSalaryPayment,
  type SalaryPaymentIdentity,
} from './idempotency';

const date = (v: string) => parseDateOnlyToUTC(v)!;

export async function createEmployee(input: unknown) {
  await requireAdmin();
  const d = employeeCreateSchema.parse(input);
  return prisma.employee.create({
    data: {
      name: d.name,
      position: d.position ?? null,
      startDate: date(d.startDate),
      endDate: d.endDate ? date(d.endDate) : null,
      active: d.active ?? true,
      note: d.note ?? null,
    },
  });
}

/**
 * Met à jour un employé. La cohérence entrée/sortie est vérifiée dans la MÊME
 * transaction que l'écriture : la ligne lue ne peut pas changer entre le
 * contrôle et la mise à jour.
 */
export async function updateEmployee(id: string, input: unknown) {
  await requireAdmin();
  const d = employeeUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (d.startDate !== undefined || d.endDate !== undefined) {
      const cur = await tx.employee.findUniqueOrThrow({ where: { id } });
      const start = d.startDate ?? formatLocalDateOnly(cur.startDate);
      const end =
        d.endDate !== undefined
          ? d.endDate
          : cur.endDate
            ? formatLocalDateOnly(cur.endDate)
            : null;
      if (end && end < start) throw new Error(SALARY_END_AFTER_START_MESSAGE);
    }
    return tx.employee.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.position !== undefined ? { position: d.position } : {}),
        ...(d.startDate !== undefined ? { startDate: date(d.startDate) } : {}),
        ...(d.endDate !== undefined
          ? { endDate: d.endDate ? date(d.endDate) : null }
          : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
    });
  });
}

/**
 * Pose le taux mensuel d'un employé à partir d'une date. Idempotent : rejouer
 * la même (employé, date) met à jour le montant au lieu de créer un doublon.
 */
export async function setSalaryRate(input: unknown) {
  await requireAdmin();
  const d = salaryRateCreateSchema.parse(input);
  const startDate = date(d.startDate);
  return prisma.salaryRate.upsert({
    where: { employeeId_startDate: { employeeId: d.employeeId, startDate } },
    create: {
      employeeId: d.employeeId,
      monthlyAmount: d.monthlyAmount,
      startDate,
    },
    update: { monthlyAmount: d.monthlyAmount },
  });
}

type SalaryPaymentRow = {
  employeeId: string;
  date: Date;
  month: string;
  amount: number;
  type: SalaryPaymentType;
};

const toIdentity = (p: SalaryPaymentRow): SalaryPaymentIdentity => ({
  employeeId: p.employeeId,
  date: formatLocalDateOnly(p.date),
  month: p.month,
  amount: p.amount,
  type: p.type,
});

/**
 * Enregistre un versement. Avec une `idempotencyKey`, un rejeu (double clic)
 * renvoie le versement déjà créé si le contenu est identique, et lève un
 * conflit s'il diffère (employé, date, mois, montant ou type). Sans clé, c'est
 * un simple `create`.
 */
export async function recordSalaryPayment(input: unknown) {
  await requireAdmin();
  const d = salaryPaymentCreateSchema.parse(input);
  const desired: SalaryPaymentIdentity = {
    employeeId: d.employeeId,
    date: d.date,
    month: d.month,
    amount: d.amount,
    type: d.type,
  };

  if (d.idempotencyKey) {
    const existing = await prisma.salaryPayment.findUnique({
      where: { idempotencyKey: d.idempotencyKey },
    });
    if (existing) {
      assertSameSalaryPayment(toIdentity(existing), desired);
      return existing;
    }
  }

  try {
    return await prisma.salaryPayment.create({
      data: {
        employeeId: d.employeeId,
        date: date(d.date),
        month: d.month,
        amount: d.amount,
        type: d.type,
        paymentMethod: d.paymentMethod ?? 'CASH',
        recoveryMonths: d.recoveryMonths ?? 1,
        note: d.note ?? null,
        idempotencyKey: d.idempotencyKey ?? null,
      },
    });
  } catch (err) {
    // Course entre deux clics simultanés : le second relit la ligne créée et
    // vérifie le contenu (un contenu différent reste un conflit).
    if (
      d.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await prisma.salaryPayment.findUniqueOrThrow({
        where: { idempotencyKey: d.idempotencyKey },
      });
      assertSameSalaryPayment(toIdentity(existing), desired);
      return existing;
    }
    throw err;
  }
}
