// Mise en forme de l'onglet Salaires. Le format monétaire vient de
// `lib/fixed-costs/format` (réutilisé, pas dupliqué) ; seuls les libellés des
// modes de paiement des dépenses (CASH / WAVE / BANK / OTHER) sont propres ici.

export const SALARY_PAYMENT_METHOD_LABELS: Record<
  'CASH' | 'WAVE' | 'BANK' | 'OTHER',
  string
> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  BANK: 'Banque',
  OTHER: 'Autre',
};
