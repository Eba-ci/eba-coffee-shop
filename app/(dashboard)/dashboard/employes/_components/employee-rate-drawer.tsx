'use client';

// Tiroir « Taux » (#441) : la liste des taux d'un employé (modifiable) et un
// formulaire en mois ENTIERS. Un nouveau taux commence toujours le 1er du mois
// suivant ; deux taux ne se chevauchent jamais ; un mois déjà versé ne peut pas
// changer de dû (le serveur refuse et dit quoi annuler d'abord).

import { useState, useTransition } from 'react';
import { BadgePlus, Info, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { shiftMonth } from '@/lib/salaries/month';
import type { SalaryRateLike } from '@/lib/salaries/types';
import {
  addSalaryRateAction,
  deleteSalaryRateAction,
  updateSalaryRateAction,
} from '../actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from './employee-sheet';
import type { EmployeeIdentity } from './employee-edit-drawer';

export type EmployeeWithRates = EmployeeIdentity & {
  /** Taux de l'employé, du plus récent au plus ancien (avec `id` et `endDate`). */
  rates: SalaryRateLike[];
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
        {open && (
          <RateForm
            employee={employee}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function periodLabel(rate: SalaryRateLike) {
  const from = monthLabel(rate.startDate.slice(0, 7));
  return rate.endDate
    ? `${from} → ${monthLabel(rate.endDate.slice(0, 7))}`
    : `Depuis ${from}`;
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
  const nextMonth = shiftMonth(today.slice(0, 7), 1);
  const [editing, setEditing] = useState<string | null>(null);
  const [startMonth, setStartMonth] = useState(nextMonth);
  const [endMonth, setEndMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentMonth = today.slice(0, 7);
  const current =
    employee.rates.find(
      (r) => r.startDate <= today && (!r.endDate || r.endDate >= today)
    ) ?? null;

  function edit(rate: SalaryRateLike) {
    setEditing(rate.id ?? null);
    setStartMonth(rate.startDate.slice(0, 7));
    setEndMonth(rate.endDate ? rate.endDate.slice(0, 7) : '');
    setAmount(String(rate.monthlyAmount));
    setError(null);
  }
  function reset() {
    setEditing(null);
    setStartMonth(nextMonth);
    setEndMonth('');
    setAmount('');
    setError(null);
  }

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    after: () => void
  ) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error);
      after();
    });
  }

  function submit() {
    if (!startMonth) return setError('Le mois de début est obligatoire');
    const value = Math.round(Number(amount));
    if (!amount.trim() || !Number.isFinite(value) || !(value > 0)) {
      return setError('Le taux doit être un montant positif');
    }
    setError(null);
    const payload = {
      monthlyAmount: value,
      startMonth,
      endMonth: endMonth || null,
    };
    run(
      () =>
        editing
          ? updateSalaryRateAction({ rateId: editing, ...payload })
          : addSalaryRateAction({ employeeId: employee.id, ...payload }),
      editing ? reset : onDone
    );
  }

  return (
    <>
      <EmployeeSheetHeader
        title="Taux de rémunération"
        description={`Montants mensuels de ${employee.name}, par périodes de mois entiers.`}
      />
      <EmployeeSheetBody>
        <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Un taux s’applique à des <strong>mois entiers</strong> : un nouveau
            taux commence toujours le <strong>1er du mois suivant</strong>,
            jamais en cours de mois. Une fin vide veut dire « en cours ». Un
            mois déjà versé ne peut pas être modifié : annulez d’abord ses
            versements.
          </p>
        </div>

        <div className="rounded-lg border p-4 text-sm">
          <p className="text-muted-foreground">Taux en vigueur</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {current ? `${money(current.monthlyAmount)} / mois` : 'Aucun taux'}
          </p>
        </div>

        {employee.rates.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {employee.rates.map((rate) => (
              <li
                key={rate.id ?? rate.startDate}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">
                    {money(rate.monthlyAmount)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {periodLabel(rate)}
                  </p>
                </div>
                {rate.id && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11"
                      aria-label={`Modifier le taux ${periodLabel(rate)}`}
                      onClick={() => edit(rate)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={
                        confirmDelete === rate.id ? 'destructive' : 'ghost'
                      }
                      className={confirmDelete === rate.id ? 'h-11' : 'size-11'}
                      aria-label={`Supprimer le taux ${periodLabel(rate)}`}
                      disabled={pending}
                      onClick={() => {
                        if (confirmDelete !== rate.id) {
                          setConfirmDelete(rate.id ?? null);
                          return;
                        }
                        setConfirmDelete(null);
                        run(
                          () => deleteSalaryRateAction({ rateId: rate.id }),
                          () => {}
                        );
                      }}
                    >
                      <Trash2 className="size-4" />
                      {confirmDelete === rate.id && 'Confirmer'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            {editing ? 'Modifier le taux' : 'Ajouter un taux'}
          </p>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rate-from">À partir du mois</Label>
              <Input
                id="rate-from"
                className="h-11"
                type="month"
                min={employee.startDate.slice(0, 7)}
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate-to">Jusqu’au mois (facultatif)</Label>
              <Input
                id="rate-to"
                className="h-11"
                type="month"
                min={startMonth || undefined}
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              />
            </div>
          </div>
          {startMonth && startMonth <= currentMonth && !editing && (
            <p className="text-xs text-muted-foreground">
              Ce mois est déjà commencé ou passé : le dû de ses mois sera
              recalculé, sauf s’ils ont déjà un versement (alors refusé).
            </p>
          )}
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
          {editing ? 'Enregistrer la modification' : 'Ajouter le taux'}
        </Button>
        {editing && (
          <Button variant="ghost" className="h-11 w-full" onClick={reset}>
            Annuler la modification
          </Button>
        )}
      </EmployeeSheetActions>
    </>
  );
}
