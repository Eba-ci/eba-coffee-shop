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
