// lib/salaries/mutations.ts
//
// Écritures du module salaires (aucune surface UI ici : les écrans arrivent
// dans les issues suivantes). Enregistrement des versements IDEMPOTENT : un
// double clic rejoué avec la même clé ne crée pas un second versement.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  salaryPaymentCreateSchema,
  salaryRateCreateSchema,
} from '@/lib/schemas/salary';
import { parseDateOnlyToUTC } from '@/lib/timezone';

const date = (v: string) => parseDateOnlyToUTC(v)!;

export async function createEmployee(input: unknown) {
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

export async function updateEmployee(id: string, input: unknown) {
  const d = employeeUpdateSchema.parse(input);
  if (d.startDate || d.endDate !== undefined) {
    const cur = await prisma.employee.findUniqueOrThrow({ where: { id } });
    const start = d.startDate ?? cur.startDate.toISOString().slice(0, 10);
    const end =
      d.endDate !== undefined
        ? d.endDate
        : (cur.endDate?.toISOString().slice(0, 10) ?? null);
    if (end && end < start)
      throw new Error('La sortie doit être après l’entrée');
  }
  return prisma.employee.update({
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
}

/**
 * Pose le taux mensuel d'un employé à partir d'une date. Idempotent : rejouer
 * la même (employé, date) met à jour le montant au lieu de créer un doublon.
 */
export async function setSalaryRate(input: unknown) {
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

/**
 * Enregistre un versement. Avec une `idempotencyKey`, un rejeu (double clic)
 * renvoie le versement déjà créé au lieu d'en créer un second. Sans clé, c'est
 * un simple `create`.
 */
export async function recordSalaryPayment(input: unknown) {
  const d = salaryPaymentCreateSchema.parse(input);
  if (d.idempotencyKey) {
    const existing = await prisma.salaryPayment.findUnique({
      where: { idempotencyKey: d.idempotencyKey },
    });
    if (existing) return existing;
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
    // Course entre deux clics simultanés : le second relit la ligne créée.
    if (
      d.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return prisma.salaryPayment.findUniqueOrThrow({
        where: { idempotencyKey: d.idempotencyKey },
      });
    }
    throw err;
  }
}
