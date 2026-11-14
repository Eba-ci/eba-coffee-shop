'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { SalaryEmployeeRow } from '@/lib/salaries/admin-lists';
import {
  createEmployeeAction,
  setSalaryRateAction,
  updateEmployeeAction,
} from './actions';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './salary-sheet';
import { RateHistorySheet } from './rate-history-sheet';
import { EmployeeRow } from './employee-row';
import { AdjustmentSheet } from './adjustment-sheet';

type Draft = {
  name: string;
  position: string;
  startDate: string;
  endDate: string;
  active: boolean;
  monthlyAmount: string;
  rateStartDate: string;
};

const empty = (today: string): Draft => ({
  name: '',
  position: '',
  startDate: today,
  endDate: '',
  active: true,
  monthlyAmount: '',
  rateStartDate: today,
});

export function EmployeeManager({
  employees,
  today,
}: {
  employees: SalaryEmployeeRow[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryEmployeeRow | null>(null);
  const [draft, setDraft] = useState<Draft>(() => empty(today));
  const [ratesFor, setRatesFor] = useState<SalaryEmployeeRow | null>(null);
  const [detailsFor, setDetailsFor] = useState<SalaryEmployeeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startCreate() {
    setEditing(null);
    setDraft(empty(today));
    setError(null);
    setOpen(true);
  }

  function startEdit(e: SalaryEmployeeRow) {
    setEditing(e);
    setDraft({
      name: e.name,
      position: e.position ?? '',
      startDate: e.startDate,
      endDate: e.endDate ?? '',
      active: e.active,
      monthlyAmount: e.rates[0] ? String(e.rates[0].monthlyAmount) : '',
      rateStartDate: e.rates[0] ? e.rates[0].startDate : today,
    });
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (!draft.name.trim()) return setError('Nom requis');
    if (!draft.startDate) return setError('Date d’entrée requise');
    const amount = draft.monthlyAmount.trim()
      ? Math.round(Number(draft.monthlyAmount))
      : null;
    if (amount !== null && !(amount > 0)) return setError('Salaire invalide');
    setError(null);
    const payload = {
      name: draft.name.trim(),
      position: draft.position.trim() || null,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      active: draft.active,
    };
    startTransition(async () => {
      let r;
      if (editing) {
        r = await updateEmployeeAction(editing.id, payload);
        const cur = editing.rates[0];
        const changed =
          amount !== null &&
          (!cur ||
            cur.monthlyAmount !== amount ||
            cur.startDate !== draft.rateStartDate);
        // Nouvelle ligne datée : l'historique des taux n'est jamais écrasé.
        if (r.ok && changed) {
          r = await setSalaryRateAction({
            employeeId: editing.id,
            monthlyAmount: amount,
            startDate: draft.rateStartDate || draft.startDate,
          });
        }
      } else {
        r = await createEmployeeAction({
          ...payload,
          monthlyAmount: amount,
          rateStartDate: draft.rateStartDate || draft.startDate,
        });
      }
      if (r.ok) setOpen(false);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <Button className="h-11" onClick={startCreate}>
        <UserPlus className="mr-1.5 h-4 w-4" />
        Nouvel employé
      </Button>

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun employé pour l’instant.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {employees.map((e) => (
            <EmployeeRow
              key={e.id}
              employee={e}
              onDetails={() => setDetailsFor(e)}
              onRates={() => setRatesFor(e)}
              onEdit={() => startEdit(e)}
            />
          ))}
        </ul>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        {/* Pleine largeur sur mobile (le clavier masquait les champs), max-w sur desktop. */}
        <SheetContent side="right" className={SALARY_SHEET_CLASS}>
          <SalarySheetHeader>
            <SheetTitle>
              {editing ? 'Modifier l’employé' : 'Nouvel employé'}
            </SheetTitle>
          </SalarySheetHeader>
          <SalarySheetBody>
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">Nom</Label>
              <Input
                id="emp-name"
                className="h-11"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-pos">Poste (facultatif)</Label>
              <Input
                id="emp-pos"
                className="h-11"
                value={draft.position}
                onChange={(e) =>
                  setDraft({ ...draft, position: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-start">Entrée</Label>
              <Input
                id="emp-start"
                className="h-11"
                type="date"
                value={draft.startDate}
                onChange={(e) =>
                  setDraft({ ...draft, startDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-end">Sortie (facultatif)</Label>
              <Input
                id="emp-end"
                className="h-11"
                type="date"
                value={draft.endDate}
                onChange={(e) =>
                  setDraft({ ...draft, endDate: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emp-salary">Salaire mensuel (FCFA)</Label>
                <Input
                  id="emp-salary"
                  className="h-11"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="ex. 150000"
                  value={draft.monthlyAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, monthlyAmount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-rate-date">Applicable depuis</Label>
                <Input
                  id="emp-rate-date"
                  className="h-11"
                  type="date"
                  value={draft.rateStartDate}
                  onChange={(e) =>
                    setDraft({ ...draft, rateStartDate: e.target.value })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              En poste
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="h-11 w-full" onClick={submit} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              {editing ? 'Enregistrer' : 'Créer l’employé'}
            </Button>
          </SalarySheetBody>
        </SheetContent>
      </Sheet>

      <RateHistorySheet
        key={ratesFor?.id ?? 'closed'}
        employee={ratesFor}
        onOpenChange={(o) => !o && setRatesFor(null)}
      />

      <AdjustmentSheet
        key={detailsFor?.id ?? 'closed'}
        employee={detailsFor}
        today={today}
        onOpenChange={(o) => !o && setDetailsFor(null)}
      />
    </div>
  );
}
