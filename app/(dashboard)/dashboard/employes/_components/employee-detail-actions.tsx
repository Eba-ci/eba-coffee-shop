'use client';

// Actions d'écriture de la fiche employé (#441) : « Modifier », « Enregistrer
// une sortie », « Nouveau taux ». Les boutons vivent dans l'en-tête de la
// page ; les champs n'existent que dans les tiroirs (fermés = aucun champ).

import { useState } from 'react';
import { CalendarX2, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmployeeEditDrawer } from './employee-edit-drawer';
import { EmployeeExitDrawer } from './employee-exit-drawer';
import {
  EmployeeRateDrawer,
  type EmployeeWithRates,
} from './employee-rate-drawer';

export function EmployeeDetailActions({
  employee,
  today,
}: {
  employee: EmployeeWithRates & { active: boolean; endDate: string | null };
  /** Date du jour (YYYY-MM-DD), passée par le serveur. */
  today: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="size-4" />
        Modifier
      </Button>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => setExitOpen(true)}
        disabled={!employee.active}
      >
        <CalendarX2 className="size-4" />
        Enregistrer une sortie
      </Button>
      <Button className="h-11" onClick={() => setRateOpen(true)}>
        <Plus className="size-4" />
        Nouveau taux
      </Button>

      <EmployeeEditDrawer
        employee={employee}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <EmployeeExitDrawer
        employee={employee}
        open={exitOpen}
        onOpenChange={setExitOpen}
        today={today}
      />
      <EmployeeRateDrawer
        employee={employee}
        open={rateOpen}
        onOpenChange={setRateOpen}
        today={today}
      />
    </>
  );
}
