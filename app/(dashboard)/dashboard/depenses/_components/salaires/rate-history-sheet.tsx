'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import type { SalaryEmployeeRow } from '@/lib/salaries/admin-queries';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './salary-sheet';
import { setSalaryRateAction } from './actions';

/**
 * Historique des taux d'un employé : liste (le plus récent d'abord) et ajout
 * d'un nouveau montant « à partir du … ». `setSalaryRate` est un upsert sur
 * (employé, date) : reposer un taux à la même date corrige le montant.
 */
export function RateHistorySheet({
  employee,
  onOpenChange,
}: {
  employee: SalaryEmployeeRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [rates, setRates] = useState<
    { monthlyAmount: number; startDate: string }[]
  >(() => employee?.rates ?? []);
  const [startDate, setStartDate] = useState(() => employee?.startDate ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = Math.round(Number(amount));
    if (!employee) return;
    if (!(value > 0)) return setError('Montant invalide');
    if (!startDate) return setError('Date d’effet requise');
    setError(null);
    startTransition(async () => {
      const r = await setSalaryRateAction({
        employeeId: employee.id,
        monthlyAmount: value,
        startDate,
      });
      if (r.ok) {
        // Upsert local (même date = montant corrigé) pour un retour immédiat.
        setRates((prev) => [
          { monthlyAmount: value, startDate },
          ...prev.filter((x) => x.startDate !== startDate),
        ]);
        setAmount('');
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Sheet open={employee !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={SALARY_SHEET_CLASS}>
        <SalarySheetHeader>
          <SheetTitle>
            {employee ? `Taux de ${employee.name}` : 'Taux'}
          </SheetTitle>
        </SalarySheetHeader>
        <SalarySheetBody>
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun taux défini : le dû de cet employé est de 0 F.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {rates.map((r) => (
                <li
                  key={r.startDate}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-muted-foreground">
                    à partir du {r.startDate}
                  </span>
                  <span className="font-medium">{money(r.monthlyAmount)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Nouveau montant</p>
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
                className="h-11"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex. 150000"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="h-11 w-full" onClick={submit} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Ajouter le taux
            </Button>
          </div>
        </SalarySheetBody>
      </SheetContent>
    </Sheet>
  );
}
