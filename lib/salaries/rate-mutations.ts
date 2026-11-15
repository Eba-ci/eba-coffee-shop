// lib/salaries/rate-mutations.ts
//
// Ajout d'un taux daté depuis la fiche employé (#441). Distinct de
// `setSalaryRate` (`mutations.ts`, upsert historique du module Employés (Paie du mois)) :
// ici un taux ne s'écrase JAMAIS. Une date déjà utilisée lève un refus lisible ;
// une correction est un NOUVEAU taux daté, ce qui garde l'historique ordonné.

import {
  SALARY_RATE_BEFORE_ENTRY_MESSAGE,
  SALARY_RATE_DUPLICATE_MESSAGE,
} from '@/config/constants';
import { Prisma } from '@/generated/prisma/client';
import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { salaryRateAddSchema } from '@/lib/schemas/salary';
import { parseDateOnlyToUTC } from '@/lib/timezone';

export async function addSalaryRate(input: unknown) {
  await requireAdmin();
  const d = salaryRateAddSchema.parse(input);
  const startDate = parseDateOnlyToUTC(d.startDate)!;
  // Un taux antérieur à l'entrée ne couvrirait aucun jour : refusé (message clair).
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: d.employeeId },
    select: { startDate: true },
  });
  if (startDate < employee.startDate) {
    throw new Error(SALARY_RATE_BEFORE_ENTRY_MESSAGE);
  }
  try {
    return await prisma.salaryRate.create({
      data: {
        employeeId: d.employeeId,
        monthlyAmount: d.monthlyAmount,
        startDate,
      },
    });
  } catch (err) {
    // Unique (employeeId, startDate) : un doublon de date n'est pas une erreur
    // technique, c'est une règle métier — on la rend lisible.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new Error(SALARY_RATE_DUPLICATE_MESSAGE);
    }
    throw err;
  }
}
