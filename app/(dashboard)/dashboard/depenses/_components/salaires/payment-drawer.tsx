'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SalaryPaymentForm } from './payment-form';

/**
 * « Nouveau versement » : un bouton sur l'écran, le formulaire dans un tiroir.
 * Le formulaire est remonté à chaque ouverture (état et clé d'idempotence
 * propres) et le tiroir se referme une fois le versement enregistré.
 */
export function SalaryPaymentDrawer({
  employees,
  defaultMonth,
  today,
}: {
  employees: { id: string; name: string }[];
  defaultMonth: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="h-11" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Nouveau versement
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Nouveau versement</SheetTitle>
            <SheetDescription>
              Salaire, acompte ou avance. Le mode de paiement par défaut est
              Wave.
            </SheetDescription>
          </SheetHeader>
          {open && (
            <div className="px-4 pb-4">
              <SalaryPaymentForm
                employees={employees}
                defaultMonth={defaultMonth}
                today={today}
                onSaved={() => setOpen(false)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
