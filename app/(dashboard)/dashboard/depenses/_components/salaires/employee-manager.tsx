'use client';

import { useState, useTransition } from 'react';
import { History, Loader2, Pencil, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import type { SalaryEmployeeRow } from '@/lib/salaries/admin-queries';
import { createEmployeeAction, updateEmployeeAction } from './actions';
import { RateHistorySheet } from './rate-history-sheet';

type Draft = {
  name: string;
  position: string;
  startDate: string;
  endDate: string;
  active: boolean;
};

const empty = (today: string): Draft => ({
  name: '',
  position: '',
  startDate: today,
  endDate: '',
  active: true,
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
    });
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (!draft.name.trim()) return setError('Nom requis');
    if (!draft.startDate) return setError('Date d’entrée requise');
    setError(null);
    const payload = {
      name: draft.name.trim(),
      position: draft.position.trim() || null,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      active: draft.active,
    };
    startTransition(async () => {
      const r = editing
        ? await updateEmployeeAction(editing.id, payload)
        : await createEmployeeAction(payload);
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
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {e.name}
                  {!e.active && <Badge variant="outline">Sorti</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.position || 'Poste non renseigné'} · depuis {e.startDate}
                  {e.endDate ? ` · jusqu’au ${e.endDate}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.rates[0]
                    ? `Taux : ${money(e.rates[0].monthlyAmount)} depuis ${e.rates[0].startDate}`
                    : 'Aucun taux défini'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => setRatesFor(e)}
                  aria-label={`Historique des taux de ${e.name}`}
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => startEdit(e)}
                  aria-label={`Modifier ${e.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editing ? 'Modifier l’employé' : 'Nouvel employé'}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4">
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
          </div>
        </SheetContent>
      </Sheet>

      <RateHistorySheet
        key={ratesFor?.id ?? 'closed'}
        employee={ratesFor}
        onOpenChange={(o) => !o && setRatesFor(null)}
      />
    </div>
  );
}
