'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { EMPLOYEE_SHEET_CLASS, EmployeeSheetHeader } from '../employee-sheet';
import { SalaryPaymentForm } from './payment-form';

/**
 * « Nouveau versement » : un bouton sur l'écran, le formulaire dans un tiroir.
 * Le formulaire est remonté à chaque ouverture (état et clé d'idempotence
 * propres) et le tiroir se referme une fois le versement enregistré.
 *
 * Depuis la liste (#466), le même tiroir est piloté (`open` / `onOpenChange`)
 * avec l'employé de la ligne présélectionné ; `hideTrigger` évite le bouton
 * en double dans le menu d'actions.
 */
export function SalaryPaymentDrawer({
  employees,
  defaultMonth,
  today,
  defaultEmployeeId,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  triggerVariant = 'default',
}: {
  employees: { id: string; name: string }[];
  defaultMonth: string;
  today: string;
  /** Employé présélectionné (action « Payer un salaire » d'une ligne). */
  defaultEmployeeId?: string;
  /** Mode piloté : l'état vit chez l'appelant. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ne pas rendre le bouton déclencheur (menu d'actions de la liste). */
  hideTrigger?: boolean;
  /** Style du bouton déclencheur (l'en-tête garde une seule action primaire). */
  triggerVariant?: 'default' | 'outline';
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;

  return (
    <>
      {!hideTrigger && (
        <Button
          variant={triggerVariant}
          className="h-11"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nouveau versement
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
          <EmployeeSheetHeader
            title="Nouveau versement"
            description="Salaire, acompte ou avance. Le mode de paiement par défaut est Wave."
          />
          {open && (
            <SalaryPaymentForm
              employees={employees}
              defaultMonth={defaultMonth}
              today={today}
              defaultEmployeeId={defaultEmployeeId}
              onSaved={() => setOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
