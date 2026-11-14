'use client';

// Fiche d'un employé : arriéré (mois clôturés non soldés), primes et retenues.
// AUCUNE règle de calcul ici : l'arriéré et le dû viennent du serveur
// (`getSalaryMonthView` / `listSalaryEmployees`) ; ce composant ne fait que
// saisir, annuler et afficher (#443, #444).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import {
  SALARY_ADJUSTMENT_NATURE_LABELS,
  SALARY_ADJUSTMENT_NATURES,
} from '@/lib/schemas/salary';
import type {
  SalaryAdjustmentRow,
  SalaryEmployeeRow,
} from '@/lib/salaries/admin-queries';
import {
  cancelSalaryAdjustmentAction,
  createSalaryAdjustmentAction,
} from './actions';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './salary-sheet';

export function AdjustmentSheet({
  employee,
  today,
  onOpenChange,
}: {
  employee: SalaryEmployeeRow | null;
  today: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SalaryAdjustmentRow[]>(
    () => employee?.adjustments ?? []
  );
  const [nature, setNature] =
    useState<(typeof SALARY_ADJUSTMENT_NATURES)[number]>('PRIME');
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const arrears = employee?.arrears;
  const count = arrears?.months.length ?? 0;
  const natureLabel = (n: SalaryAdjustmentRow['nature']) =>
    SALARY_ADJUSTMENT_NATURE_LABELS[
      n as keyof typeof SALARY_ADJUSTMENT_NATURE_LABELS
    ];

  function submit() {
    if (!employee) return;
    const value = Math.round(Number(amount));
    if (!(value > 0)) return setError('Montant invalide');
    if (!month) return setError('Mois requis');
    if (!date) return setError('Date requise');
    setError(null);
    startTransition(async () => {
      const r = await createSalaryAdjustmentAction({
        employeeId: employee.id,
        month,
        date,
        nature,
        amount: value,
        note: note.trim() || null,
      });
      if (!r.ok) return setError(r.error);
      setRows((prev) => [
        {
          id: `local-${Date.now()}`,
          employeeId: employee.id,
          employeeName: employee.name,
          date,
          month,
          nature,
          amount: value,
          note: note.trim() || null,
          canceledAt: null,
        },
        ...prev,
      ]);
      setAmount('');
      setNote('');
      router.refresh();
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const r = await cancelSalaryAdjustmentAction({ adjustmentId: id });
      if (!r.ok) return setError(r.error);
      setRows((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, canceledAt: a.canceledAt ?? today } : a
        )
      );
      router.refresh();
    });
  }

  return (
    <Sheet open={employee !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={SALARY_SHEET_CLASS}>
        <SalarySheetHeader>
          <SheetTitle>
            {employee ? `Fiche de ${employee.name}` : 'Fiche employé'}
          </SheetTitle>
        </SalarySheetHeader>
        <SalarySheetBody>
          <section className="rounded-lg border p-3" aria-label="Arriéré">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Arriéré</p>
              {count > 0 ? (
                <Badge variant="secondary">Impayé</Badge>
              ) : (
                <Badge variant="outline">À jour</Badge>
              )}
            </div>
            <p className="mt-1 text-lg font-semibold">
              {money(arrears?.total ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {count === 0
                ? 'Aucun mois clôturé impayé.'
                : `${count} mois concerné${count > 1 ? 's' : ''}${
                    arrears?.oldestMonth
                      ? ` · plus ancien : ${monthLabel(arrears.oldestMonth)}`
                      : ''
                  }`}
            </p>
            {count > 0 && (
              <ul className="mt-2 divide-y rounded-md border text-sm">
                {arrears!.months.map((m) => (
                  <li
                    key={m.month}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="capitalize text-muted-foreground">
                      {monthLabel(m.month)}
                    </span>
                    <span className="font-medium">{money(m.remaining)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Nouvelle prime / retenue</p>
            <div className="space-y-1.5">
              <Label htmlFor="adj-nature">Nature</Label>
              <Select
                value={nature}
                onValueChange={(v) =>
                  setNature(v as (typeof SALARY_ADJUSTMENT_NATURES)[number])
                }
              >
                <SelectTrigger id="adj-nature" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALARY_ADJUSTMENT_NATURES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {SALARY_ADJUSTMENT_NATURE_LABELS[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="adj-month">Mois concerné</Label>
                <Input
                  id="adj-month"
                  className="h-11"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-date">Date</Label>
                <Input
                  id="adj-date"
                  className="h-11"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Montant (FCFA)</Label>
              <Input
                id="adj-amount"
                className="h-11"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex. 50000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-note">Note (facultatif)</Label>
              <Input
                id="adj-note"
                className="h-11"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="h-11 w-full" onClick={submit} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </section>

          <section className="space-y-2" aria-label="Historique">
            <p className="text-sm font-medium">Primes et retenues</p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun ajustement pour l’instant.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {rows.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {natureLabel(a.nature)}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {monthLabel(a.month)}
                        </span>
                      </span>
                      <span
                        className={
                          a.canceledAt
                            ? 'text-muted-foreground line-through'
                            : 'font-semibold'
                        }
                      >
                        {a.nature === 'PRIME' ? '+' : '−'} {money(a.amount)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {a.date}
                        {a.note ? ` · ${a.note}` : ''}
                        {a.canceledAt ? ' · annulé' : ''}
                      </span>
                      {!a.canceledAt && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11"
                          onClick={() => cancel(a.id)}
                          disabled={pending}
                          aria-label={`Annuler ${natureLabel(a.nature)} du ${a.month}`}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </SalarySheetBody>
      </SheetContent>
    </Sheet>
  );
}
