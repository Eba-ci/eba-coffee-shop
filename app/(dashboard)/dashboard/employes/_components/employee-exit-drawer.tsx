'use client';

// Tiroir « Enregistrer une sortie » (#441) : fixe la date de sortie et rend
// l'employé inactif. Aucune suppression : taux, versements et arriéré restent
// lisibles. Réutilisable (props `employee`, `open`, `onOpenChange`).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarX2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SALARY_END_AFTER_START_MESSAGE } from '@/config/constants';
import { recordEmployeeExitAction } from '../actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from './employee-sheet';
import type { EmployeeIdentity } from './employee-edit-drawer';

export function EmployeeExitDrawer({
  employee,
  open,
  onOpenChange,
  today,
}: {
  employee: EmployeeIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date du jour (YYYY-MM-DD), passée par le serveur. */
  today: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <ExitForm
          employee={employee}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ExitForm({
  employee,
  today,
  onDone,
}: {
  employee: EmployeeIdentity;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!endDate) return setError('La date de sortie est obligatoire');
    if (endDate < employee.startDate) {
      return setError(SALARY_END_AFTER_START_MESSAGE);
    }
    setError(null);
    startTransition(async () => {
      const result = await recordEmployeeExitAction(employee.id, { endDate });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <EmployeeSheetHeader
        title="Enregistrer une sortie"
        description={`${employee.name} quitte l’effectif. Son historique est conservé.`}
      />
      <EmployeeSheetBody>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p>
            Date d’entrée :{' '}
            <span className="font-medium tabular-nums">
              {employee.startDate}
            </span>
          </p>
          <p className="mt-1 text-muted-foreground">
            L’employé devient inactif et sort des listes actives, sans être
            supprimé.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exit-emp-date">Date de sortie</Label>
          <Input
            id="exit-emp-date"
            className="h-11"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            La sortie ne peut pas précéder l’entrée.
          </p>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button
          variant="destructive"
          className="h-11 w-full"
          onClick={submit}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarX2 className="size-4" />
          )}
          Confirmer la sortie
        </Button>
      </EmployeeSheetActions>
    </>
  );
}
