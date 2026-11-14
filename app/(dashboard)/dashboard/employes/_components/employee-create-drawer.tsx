'use client';

// Tiroir « Nouvel employé » (#441) : nom obligatoire, poste, date d'entrée,
// note, et premier taux optionnel (même écriture que l'employé, via
// `createEmployee`). Réutilisable depuis la liste (#466) : seules les props
// `open` / `onOpenChange` (+ `today` pour la date par défaut) sont requises.
//
// Le formulaire est un enfant monté DANS le `SheetContent` : Radix le démonte à
// la fermeture, donc chaque ouverture repart d'un brouillon neuf (sans effet
// de synchronisation).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { SALARY_NOTE_MAX } from '@/config/constants';
import { createEmployeeAction } from '../actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from './employee-sheet';

export function EmployeeCreateDrawer({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date du jour (YYYY-MM-DD), passée par le serveur. */
  today: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <CreateForm today={today} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function CreateForm({ today, onDone }: { today: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [note, setNote] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [rateStartDate, setRateStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return setError('Le nom est obligatoire');
    if (!startDate) return setError('La date d’entrée est obligatoire');

    const hasRate = monthlyAmount.trim() !== '';
    const amount = hasRate ? Math.round(Number(monthlyAmount)) : null;
    if (amount !== null && !(amount > 0)) {
      return setError('Le premier taux doit être un montant positif');
    }
    const rateDate = rateStartDate || startDate;
    if (amount !== null && rateDate < startDate) {
      return setError('La date du taux ne peut pas précéder l’entrée');
    }

    setError(null);
    startTransition(async () => {
      const result = await createEmployeeAction({
        name: name.trim(),
        position: position.trim() || null,
        startDate,
        note: note.trim() || null,
        ...(amount !== null
          ? { monthlyAmount: amount, rateStartDate: rateDate }
          : {}),
      });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <EmployeeSheetHeader
        title="Nouvel employé"
        description="Le nom suffit pour créer la fiche. Le premier taux est facultatif."
      />
      <EmployeeSheetBody>
        <div className="space-y-1.5">
          <Label htmlFor="new-emp-name">Nom</Label>
          <Input
            id="new-emp-name"
            className="h-11"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-emp-position">Poste (facultatif)</Label>
          <Input
            id="new-emp-position"
            className="h-11"
            autoComplete="off"
            placeholder="ex. Barista"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-emp-start">Date d’entrée</Label>
          <Input
            id="new-emp-start"
            className="h-11"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-emp-note">Note (facultatif)</Label>
          <Textarea
            id="new-emp-note"
            rows={3}
            maxLength={SALARY_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">
            Premier taux (facultatif)
          </legend>
          <p className="text-xs text-muted-foreground">
            Montant mensuel applicable à partir d’une date. Il peut aussi être
            ajouté plus tard depuis la fiche.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="new-emp-amount">Montant mensuel (FCFA)</Label>
            <Input
              id="new-emp-amount"
              className="h-11 tabular-nums"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="ex. 150000"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-emp-rate-date">Applicable à partir du</Label>
            <Input
              id="new-emp-rate-date"
              className="h-11"
              type="date"
              value={rateStartDate}
              onChange={(e) => setRateStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Par défaut, la date d’entrée.
            </p>
          </div>
        </fieldset>

        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button className="h-11 w-full" onClick={submit} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Créer l’employé
        </Button>
      </EmployeeSheetActions>
    </>
  );
}
