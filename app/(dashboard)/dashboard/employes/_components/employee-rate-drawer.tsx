'use client';

// Tiroir « Nouveau taux » (#441) : ajoute un taux mensuel daté. Un taux ne
// s'écrase jamais — une date déjà utilisée est refusée par le serveur, une
// correction est un nouveau taux. Réutilisable (props `employee`, `open`,
// `onOpenChange`).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import { ratePlacement } from '@/lib/salaries/rate-timeline';
import { addSalaryRateAction } from '../actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from './employee-sheet';
import type { EmployeeIdentity } from './employee-edit-drawer';

export type EmployeeWithRates = EmployeeIdentity & {
  /** Historique des taux, du plus récent au plus ancien. */
  rates: { monthlyAmount: number; startDate: string }[];
};

function yesterday(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function EmployeeRateDrawer({
  employee,
  open,
  onOpenChange,
  today,
}: {
  employee: EmployeeWithRates;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date du jour (YYYY-MM-DD), passée par le serveur. */
  today: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <RateForm
          employee={employee}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function RateForm({
  employee,
  today,
  onDone,
}: {
  employee: EmployeeWithRates;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'new' | 'past'>('new');
  const [startDate, setStartDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = employee.rates.find((r) => r.startDate <= today) ?? null;

  const placement = ratePlacement(
    employee.rates,
    startDate,
    employee.startDate,
    today
  );

  function pickMode(next: 'new' | 'past') {
    setMode(next);
    setError(null);
    setStartDate(next === 'past' ? employee.startDate : today);
  }

  function submit() {
    if (!startDate) return setError('La date d’effet est obligatoire');
    const value = Math.round(Number(amount));
    if (!amount.trim() || !Number.isFinite(value) || !(value > 0)) {
      return setError('Le taux doit être un montant positif');
    }
    if (mode === 'past' && startDate >= today) {
      return setError('Un ancien taux doit commencer avant aujourd’hui');
    }
    setError(null);
    startTransition(async () => {
      const result = await addSalaryRateAction({
        employeeId: employee.id,
        monthlyAmount: value,
        startDate,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <EmployeeSheetHeader
        title={mode === 'past' ? 'Ancien taux' : 'Nouveau taux'}
        description={
          mode === 'past'
            ? `Saisir un taux déjà appliqué à ${employee.name} : il recalcule le dû des mois concernés.`
            : `Taux mensuel de ${employee.name}, applicable à partir d’une date.`
        }
      />
      <EmployeeSheetBody>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="text-muted-foreground">Taux en vigueur</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {current ? `${money(current.monthlyAmount)} / mois` : 'Aucun taux'}
          </p>
          {current && (
            <p className="mt-1 text-xs text-muted-foreground">
              Depuis le {current.startDate}
            </p>
          )}
        </div>

        {employee.rates.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Historique
            </p>
            <ul className="mt-1 divide-y text-sm">
              {employee.rates.map((rate) => (
                <li
                  key={rate.startDate}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <span className="text-muted-foreground">
                    Depuis le {rate.startDate}
                  </span>
                  <span className="font-medium tabular-nums">
                    {money(rate.monthlyAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(
              [
                ['new', 'Nouveau taux'],
                ['past', 'Ancien taux'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => pickMode(value)}
                className="min-h-11 rounded-lg border px-3 text-sm font-medium aria-checked:border-primary aria-checked:bg-primary/5"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-date">À partir du</Label>
            <Input
              id="rate-date"
              className="h-11"
              type="date"
              min={mode === 'past' ? employee.startDate : undefined}
              max={mode === 'past' ? yesterday(today) : undefined}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          {mode === 'past' && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs">
              {placement.duplicate
                ? 'Un taux existe déjà à cette date.'
                : placement.beforeEmployment
                  ? 'Cette date précède l’entrée de l’employé.'
                  : placement.endDate
                    ? `Ce taux couvrira la période jusqu’au ${placement.endDate}.`
                    : 'Aucun taux plus récent : il couvrira jusqu’à aujourd’hui et au-delà.'}{' '}
              Le dû et l’arriéré des mois concernés seront recalculés ; les
              versements déjà saisis ne changent pas.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rate-amount">Montant mensuel (FCFA)</Label>
            <Input
              id="rate-amount"
              className="h-11 tabular-nums"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="ex. 150000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Une date déjà utilisée est refusée : pour corriger un montant,
            choisis une nouvelle date.
          </p>
          {error && <FieldError>{error}</FieldError>}
        </div>
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button className="h-11 w-full" onClick={submit} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <BadgePlus className="size-4" />
          )}
          Ajouter le taux
        </Button>
      </EmployeeSheetActions>
    </>
  );
}
