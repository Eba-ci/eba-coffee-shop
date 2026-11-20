import { Info } from 'lucide-react';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import type { PaymentWarning } from '@/lib/salaries/partial-warning';

/** Texte du message (pur, testable). */
export function partialNoticeText(
  warning: PaymentWarning,
  month: string
): string {
  const m = monthLabel(month);
  const debt = (a: number) =>
    a > 0 ? ` ${money(a)} d’arriéré restent par ailleurs à régler.` : '';
  switch (warning.kind) {
    case 'partial':
      return `Il restera ${money(warning.unpaid)} d’impayé sur ${m}.${debt(warning.arrears)}`;
    case 'excess':
      return `Ce montant dépasse le reste à payer de ${m} de ${money(warning.excess)}.${debt(warning.arrears)}`;
    case 'arrears-only':
      return `Rien ne reste à payer sur ${m}, mais ${money(warning.arrears)} d’arriéré sont dus : ce versement règle une dette, choisissez le mois concerné.`;
    case 'nothing-due':
      return `Aucun salaire n’est dû à cet employé sur ${m} : ${money(warning.excess)} seraient versés en excédent.`;
  }
}

/** Message informatif, jamais bloquant (#446). */
export function PartialNotice({
  warning,
  month,
}: {
  warning: PaymentWarning | null;
  month: string;
}) {
  if (!warning) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{partialNoticeText(warning, month)}</span>
    </p>
  );
}
