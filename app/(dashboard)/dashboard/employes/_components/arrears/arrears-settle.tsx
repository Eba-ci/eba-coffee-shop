'use client';

// Arriéré d'un employé : liste des mois impayés, sélection par mois, barre
// « Régler N mois ». Pas de <input> dans la fiche (règle « aucun champ de
// saisie sur une page de consultation ») : les cases sont des boutons
// `role="checkbox"`, la saisie vit dans le tiroir monté à l'ouverture.

import { useMemo, useState } from 'react';
import { Check, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { cn } from '@/lib/utils';
import { ArrearsSettleDrawer } from './arrears-settle-drawer';
import { splitArrears, type ArrearsMonth } from './settle-plan';

function MonthRow({
  row,
  checked,
  onToggle,
}: {
  row: ArrearsMonth;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded border',
            checked && 'border-primary bg-primary text-primary-foreground'
          )}
        >
          {checked && <Check className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate">{monthLabel(row.month)}</span>
        <span className="font-medium tabular-nums">{money(row.remaining)}</span>
      </button>
    </li>
  );
}

export function ArrearsSettle({
  employeeId,
  employeeName,
  currentMonth,
  today,
  months,
}: {
  employeeId: string;
  employeeName: string;
  currentMonth: string;
  today: string;
  months: ArrearsMonth[];
}) {
  const { dueNow, older } = useMemo(
    () => splitArrears(months, currentMonth),
    [months, currentMonth]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  if (months.length === 0) return null;

  const toggle = (month: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  const chosen = months.filter((m) => selected.has(m.month));
  const total = chosen.reduce((a, m) => a + m.remaining, 0);
  const allSelected = chosen.length === months.length;

  const group = (title: string, hint: string, rows: ArrearsMonth[]) =>
    rows.length > 0 && (
      <div className="space-y-1.5">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <MonthRow
              key={row.month}
              row={row}
              checked={selected.has(row.month)}
              onToggle={() => toggle(row.month)}
            />
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-3">
      {group(
        'À payer ce mois-ci',
        'La paie normale du mois qui vient de se clore.',
        dueNow ? [dueNow] : []
      )}
      {group('Arriéré', 'Mois plus anciens, encore impayés.', older)}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={() =>
            setSelected(
              allSelected ? new Set() : new Set(months.map((m) => m.month))
            )
          }
        >
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={chosen.length === 0}
          onClick={() => setOpen(true)}
        >
          <HandCoins className="size-4" aria-hidden="true" />
          {chosen.length === 0
            ? 'Régler des mois'
            : `Régler ${chosen.length} mois · ${money(total)}`}
        </Button>
      </div>
      <ArrearsSettleDrawer
        open={open}
        onOpenChange={setOpen}
        employeeId={employeeId}
        employeeName={employeeName}
        today={today}
        months={chosen}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
