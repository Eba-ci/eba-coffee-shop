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

/**
 * État d'apurement présenté sur la bande de synthèse. Ce n'est PAS un calcul de
 * paie : les montants viennent du ledger, on ne fait que choisir le libellé et
 * l'icône qui les accompagnent. L'arriéré (mois clôturés) prime sur le mois en
 * cours ; « en retard » reste donc réservé aux impayés constatés.
 */
export type SettlementState = 'settled' | 'partial' | 'late';

export const SETTLEMENT_STATE_LABELS: Record<SettlementState, string> = {
  settled: 'Soldé',
  partial: 'Partiel',
  late: 'En retard',
};

export function settlementState(input: {
  remainingToPay: number;
  arrearsTotal: number;
}): SettlementState {
  if (input.arrearsTotal > 0) return 'late';
  if (input.remainingToPay <= 0) return 'settled';
  return 'partial';
}

/** Initiales d'un nom (2 lettres max) pour l'avatar de la liste/fiche. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
