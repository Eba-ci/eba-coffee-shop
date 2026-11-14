'use client';

// Tiroir « Modifier » (#441) : identité et poste seulement. Ne touche JAMAIS
// aux taux ni aux versements (mutations distinctes dans `lib/salaries`).
// Réutilisable (props `employee`, `open`, `onOpenChange`). Le formulaire est
// monté dans le `SheetContent` : il est démonté à la fermeture.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { SALARY_NOTE_MAX } from '@/config/constants';
import { updateEmployeeIdentityAction } from '../actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from './employee-sheet';

export type EmployeeIdentity = {
  id: string;
  name: string;
  position: string | null;
  startDate: string;
  note: string | null;
};

export function EmployeeEditDrawer({
  employee,
  open,
  onOpenChange,
}: {
  employee: EmployeeIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <EditForm employee={employee} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function EditForm({
  employee,
  onDone,
}: {
  employee: EmployeeIdentity;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(employee.name);
  const [position, setPosition] = useState(employee.position ?? '');
  const [startDate, setStartDate] = useState(employee.startDate);
  const [note, setNote] = useState(employee.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return setError('Le nom est obligatoire');
    if (!startDate) return setError('La date d’entrée est obligatoire');
    setError(null);
    startTransition(async () => {
      const result = await updateEmployeeIdentityAction(employee.id, {
        name: name.trim(),
        position: position.trim() || null,
        startDate,
        note: note.trim() || null,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <EmployeeSheetHeader
        title="Modifier l’employé"
        description={`Identité et poste de ${employee.name}. Les taux et versements ne sont pas modifiés.`}
      />
      <EmployeeSheetBody>
        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-name">Nom</Label>
          <Input
            id="edit-emp-name"
            className="h-11"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-position">Poste (facultatif)</Label>
          <Input
            id="edit-emp-position"
            className="h-11"
            autoComplete="off"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-start">Date d’entrée</Label>
          <Input
            id="edit-emp-start"
            className="h-11"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-note">Note (facultatif)</Label>
          <Textarea
            id="edit-emp-note"
            rows={3}
            maxLength={SALARY_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button className="h-11 w-full" onClick={submit} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Enregistrer
        </Button>
      </EmployeeSheetActions>
    </>
  );
}
