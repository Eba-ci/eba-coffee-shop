// lib/salaries/mappers.ts
//
// Traduction UNIQUE des lignes Prisma (dates `Date`) vers les formes « likes »
// attendues par les règles pures (`EmployeeLike`, `SalaryRateLike`). Toute
// surface qui charge ces colonnes passe par ici : une seule convention de
// conversion date → « YYYY-MM-DD » (fuseau d'Abidjan).

import { formatLocalDateOnly } from '@/lib/timezone';
import type { EmployeeLike, SalaryRateLike } from './types';

type EmployeeRow = { startDate: Date; endDate: Date | null };

type SalaryRateRow = { monthlyAmount: number; startDate: Date };

/** Ligne `Employee` → `EmployeeLike` (dates au format « YYYY-MM-DD »). */
export function toEmployeeLike(employee: EmployeeRow): EmployeeLike {
  return {
    startDate: formatLocalDateOnly(employee.startDate),
    endDate: employee.endDate ? formatLocalDateOnly(employee.endDate) : null,
  };
}

/** Ligne `SalaryRate` → `SalaryRateLike` (date au format « YYYY-MM-DD »). */
export function toSalaryRateLike(rate: SalaryRateRow): SalaryRateLike {
  return {
    monthlyAmount: rate.monthlyAmount,
    startDate: formatLocalDateOnly(rate.startDate),
  };
}
