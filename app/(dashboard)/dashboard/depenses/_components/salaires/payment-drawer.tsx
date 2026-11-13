'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './salary-sheet';
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
        <SheetContent
          side="right"
          className={`${SALARY_SHEET_CLASS} sm:max-w-lg`}
        >
          <SalarySheetHeader>
            <SheetTitle>Nouveau versement</SheetTitle>
            <SheetDescription>
              Salaire, acompte ou avance. Le mode de paiement par défaut est
              Wave.
            </SheetDescription>
          </SalarySheetHeader>
          {open && (
            <SalarySheetBody>
              <SalaryPaymentForm
                employees={employees}
                defaultMonth={defaultMonth}
                today={today}
                onSaved={() => setOpen(false)}
              />
            </SalarySheetBody>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
