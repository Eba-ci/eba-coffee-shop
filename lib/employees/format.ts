// Libellés d'affichage de la fiche Employés (#440). Pur et isomorphe.

import type { SalaryPaymentType } from '@/generated/prisma/enums';

export const SALARY_PAYMENT_TYPE_LABELS: Record<SalaryPaymentType, string> = {
  SALAIRE: 'Salaire',
  ACOMPTE: 'Acompte',
  AVANCE: 'Avance',
};

export type EmploymentStatus = 'active' | 'left';

export function employmentLabel(
  active: boolean,
  endDate: string | null
): string {
  if (active) return 'En poste';
  return endDate ? `Sorti le ${endDate}` : 'Sorti';
}

/** Initiales d'un nom (2 lettres max) pour l'avatar de la liste/fiche. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
