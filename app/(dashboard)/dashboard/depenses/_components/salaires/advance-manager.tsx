'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { money } from '@/lib/fixed-costs/format';
import type { SalaryAdvanceRow } from '@/lib/salaries/admin-queries';
import {
  adjustSalaryAdvanceAction,
  cancelSalaryAdvanceAction,
  updateAdvanceRecoveryAction,
} from './actions';

function AdvanceRow({ advance }: { advance: SalaryAdvanceRow }) {
  const [recovery, setRecovery] = useState(String(advance.recoveryMonths));
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(advance.amount));
  const [month, setMonth] = useState(advance.month);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveRecovery() {
    setError(null);
    startTransition(async () => {
      const r = await updateAdvanceRecoveryAction({
        paymentId: advance.id,
        recoveryMonths: Math.round(Number(recovery)) || 1,
      });
      if (!r.ok) setError(r.error);
    });
  }

  function saveAdjust() {
    const value = Math.round(Number(amount));
    if (!(value > 0)) return setError('Montant invalide');
    setError(null);
    startTransition(async () => {
      const r = await adjustSalaryAdvanceAction({
        paymentId: advance.id,
        amount: value,
        month,
      });
      if (r.ok) setEditing(false);
      else setError(r.error);
    });
  }

  function cancel() {
    if (!window.confirm(`Annuler l’avance de ${money(advance.amount)} ?`))
      return;
    setError(null);
    startTransition(async () => {
      const r = await cancelSalaryAdvanceAction({ paymentId: advance.id });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {advance.employeeName} · {money(advance.amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            versée le {advance.date} · mois {advance.month}
            {advance.note ? ` · ${advance.note}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={() => setEditing((v) => !v)}
            aria-label="Ajuster l’avance"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={cancel}
            disabled={pending}
            aria-label="Annuler l’avance"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`rec-${advance.id}`} className="text-xs">
            Récupération sur (mois)
          </Label>
          <Input
            id={`rec-${advance.id}`}
            className="h-11 w-24"
            type="number"
            min={1}
            max={60}
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-11"
          onClick={saveRecovery}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          Étaler
        </Button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
          <div className="space-y-1">
            <Label htmlFor={`amt-${advance.id}`} className="text-xs">
              Montant
            </Label>
            <Input
              id={`amt-${advance.id}`}
              className="h-11 w-32"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mon-${advance.id}`} className="text-xs">
              Mois concerné
            </Label>
            <Input
              id={`mon-${advance.id}`}
              className="h-11"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button className="h-11" onClick={saveAdjust} disabled={pending}>
            <Check className="mr-1.5 h-4 w-4" />
            Enregistrer
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setEditing(false)}
            aria-label="Fermer l’ajustement"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

/**
 * Gestion des avances : modifier l'étalement de la récupération, ajuster le
 * contenu, ou annuler une avance. Chaque opération est idempotente côté
 * serveur (un double clic ne double rien).
 */
export function AdvanceManager({ advances }: { advances: SalaryAdvanceRow[] }) {
  if (advances.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune avance enregistrée.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {advances.map((a) => (
        <AdvanceRow key={a.id} advance={a} />
      ))}
    </ul>
  );
}
