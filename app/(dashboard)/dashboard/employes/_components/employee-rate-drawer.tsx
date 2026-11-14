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
  const [startDate, setStartDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = employee.rates.find((r) => r.startDate <= today) ?? null;

  function submit() {
    if (!startDate) return setError('La date d’effet est obligatoire');
    const value = Math.round(Number(amount));
    if (!amount.trim() || !Number.isFinite(value) || !(value > 0)) {
      return setError('Le taux doit être un montant positif');
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
        title="Nouveau taux"
        description={`Taux mensuel de ${employee.name}, applicable à partir d’une date.`}
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
          <p className="text-sm font-medium">Nouveau taux</p>
          <div className="space-y-1.5">
            <Label htmlFor="rate-date">À partir du</Label>
            <Input
              id="rate-date"
              className="h-11"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
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
