// lib/salaries/mappers.ts
//
// Traduction UNIQUE des lignes Prisma (dates `Date`) vers les formes « likes »
// attendues par les règles pures (`EmployeeLike`, `SalaryRateLike`). Toute
// surface qui charge ces colonnes passe par ici : une seule convention de
// conversion date → « YYYY-MM-DD » (fuseau d'Abidjan).

import { formatLocalDateOnly } from '@/lib/timezone';
import type { EmployeeLike, SalaryRateLike } from './types';

type EmployeeRow = { startDate: Date; endDate: Date | null };

type SalaryRateRow = {
  id?: string;
  monthlyAmount: number;
  startDate: Date;
  endDate?: Date | null;
};

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
    ...(rate.id ? { id: rate.id } : {}),
    monthlyAmount: rate.monthlyAmount,
    startDate: formatLocalDateOnly(rate.startDate),
    endDate: rate.endDate ? formatLocalDateOnly(rate.endDate) : null,
  };
}

/**
 * Colonnes d'un taux à lire PARTOUT où l'on rejoue le journal : oublier
 * `endDate` ferait ignorer silencieusement la fin d'un taux. Une seule
 * définition, importée par chaque requête.
 */
/**
 * Un versement annulé sort de TOUS les calculs. Toute lecture qui rejoue le
 * journal filtre ses versements par ce prédicat (une seule définition).
 */
export const ACTIVE_PAYMENT_WHERE = { canceledAt: null } as const;

export const SALARY_RATE_SELECT = {
  id: true,
  monthlyAmount: true,
  startDate: true,
  endDate: true,
} as const;
