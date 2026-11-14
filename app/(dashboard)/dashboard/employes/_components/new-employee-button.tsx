'use client';

// Action primaire de la liste Employés (#441) : ouvre le tiroir de création.
// Le tiroir n'est monté qu'à l'ouverture (Radix) : fermé, aucun champ de
// saisie n'existe dans la page.

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmployeeCreateDrawer } from './employee-create-drawer';

export function NewEmployeeButton({
  today,
  label = 'Nouvel employé',
}: {
  today: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className="h-11" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        {label}
      </Button>
      <EmployeeCreateDrawer open={open} onOpenChange={setOpen} today={today} />
    </>
  );
}
