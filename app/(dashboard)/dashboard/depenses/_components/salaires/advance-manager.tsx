'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './salary-sheet';
import { money } from '@/lib/fixed-costs/format';
import type { SalaryAdvanceRow } from '@/lib/salaries/admin-lists';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
            onClick={() => setEditing(true)}
            aria-label="Ajuster l’avance"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            aria-label="Annuler l’avance"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette avance ?</AlertDialogTitle>
            <AlertDialogDescription>
              L’avance de {money(advance.amount)} pour {advance.employeeName}{' '}
              sera annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>
              Annuler l’avance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="right" className={SALARY_SHEET_CLASS}>
          <SalarySheetHeader>
            <SheetTitle>
              Avance de {advance.employeeName} · {money(advance.amount)}
            </SheetTitle>
          </SalarySheetHeader>
          <SalarySheetBody>
            <div className="space-y-1.5">
              <Label htmlFor={`amt-${advance.id}`}>Montant</Label>
              <Input
                id={`amt-${advance.id}`}
                className="h-11"
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`mon-${advance.id}`}>Mois concerné</Label>
              <Input
                id={`mon-${advance.id}`}
                className="h-11"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <Button
              className="h-11 w-full"
              onClick={saveAdjust}
              disabled={pending}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Enregistrer l’ajustement
            </Button>

            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor={`rec-${advance.id}`}>
                Récupération sur (mois)
              </Label>
              <Input
                id={`rec-${advance.id}`}
                className="h-11"
                type="number"
                min={1}
                max={60}
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
              />
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={saveRecovery}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Étaler la récupération
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </SalarySheetBody>
        </SheetContent>
      </Sheet>

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
