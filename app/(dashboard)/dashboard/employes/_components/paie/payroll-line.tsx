'use client';

// Une ligne de « Payer toute la paie » : case, montant modifiable (par défaut
// le reste entier, plafonné au reste côté serveur) et avertissement de paiement
// partiel (#446), calculé par la même fonction pure que le formulaire unitaire.

import { Input } from '@/components/ui/input';
import { money } from '@/lib/fixed-costs/format';
import { salaryPaymentWarning } from '@/lib/salaries/partial-warning';
import { PartialNotice } from './partial-notice';

export type PayrollRow = {
  id: string;
  name: string;
  remaining: number;
  /** Arriéré des mois clôturés (ledger), pour distinguer du reste du mois. */
  arrears?: number;
};

export function PayrollLine({
  row,
  month,
  checked,
  amount,
  onToggle,
  onAmount,
}: {
  row: PayrollRow;
  month: string;
  checked: boolean;
  amount: number;
  onToggle: (on: boolean) => void;
  onAmount: (value: string) => void;
}) {
  const warning = checked
    ? salaryPaymentWarning(amount, {
        remaining: row.remaining,
        arrears: row.arrears ?? 0,
      })
    : null;
  return (
    <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={`payroll-check-${row.id}`}
          type="checkbox"
          className="size-5 shrink-0 accent-primary"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Payer ${row.name}`}
        />
        <label
          htmlFor={`payroll-check-${row.id}`}
          className="min-w-0 flex-1 truncate"
        >
          {row.name}
          <span className="block text-xs text-muted-foreground tabular-nums">
            Reste {money(row.remaining)}
          </span>
        </label>
        <Input
          aria-label={`Montant pour ${row.name}`}
          className="h-11 w-32 shrink-0 tabular-nums"
          type="number"
          inputMode="numeric"
          min={1}
          max={row.remaining}
          step={1}
          disabled={!checked}
          value={amount > 0 ? String(amount) : ''}
          onChange={(e) => onAmount(e.target.value)}
        />
      </div>
      {warning && <PartialNotice warning={warning} month={month} />}
    </div>
  );
}
