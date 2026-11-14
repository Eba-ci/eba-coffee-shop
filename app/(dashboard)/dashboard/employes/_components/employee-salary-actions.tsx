'use client';

// Actions de paie de la fiche employé (#450) : primes/retenues et avances.
// Elles ouvrent des tiroirs — jamais des champs posés sur la fiche. Les
// données viennent de `listSalaryEmployees` / `listSalaryAdvances` (aucune
// règle recalculée), et le serveur garde ADMIN sur chaque écriture.

import { useState } from 'react';
import { Banknote, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import type {
  SalaryAdvanceRow,
} from '@/lib/salaries/admin-lists';
import type { SalaryEmployeeRow } from '@/lib/salaries/admin-lists';
import { AdjustmentSheet } from './paie/adjustment-sheet';
import { AdvanceManager } from './paie/advance-manager';
import {
  SALARY_SHEET_CLASS,
  SalarySheetBody,
  SalarySheetHeader,
} from './paie/salary-sheet';

export function EmployeeSalaryActions({
  employee,
  advances,
  today,
}: {
  employee: SalaryEmployeeRow | null;
  advances: SalaryAdvanceRow[];
  today: string;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [advancesOpen, setAdvancesOpen] = useState(false);

  // Non-admin (COMPTABLE) : la page ne charge pas ces données → aucune action.
  if (!employee) return null;

  return (
    <>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => setAdjustOpen(true)}
      >
        <Banknote className="size-4" aria-hidden="true" />
        Prime / retenue
      </Button>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => setAdvancesOpen(true)}
      >
        <HandCoins className="size-4" aria-hidden="true" />
        Avances
      </Button>

      {adjustOpen && (
        <AdjustmentSheet
          employee={employee}
          today={today}
          onOpenChange={setAdjustOpen}
        />
      )}

      <Sheet open={advancesOpen} onOpenChange={setAdvancesOpen}>
        <SheetContent side="right" className={SALARY_SHEET_CLASS}>
          <SalarySheetHeader>
            <SheetTitle>Avances de {employee.name}</SheetTitle>
            <SheetDescription>
              Ajuster le montant ou l’étalement, ou annuler une avance. Les
              récupérations restent recalculées par le ledger.
            </SheetDescription>
          </SalarySheetHeader>
          <SalarySheetBody>
            <AdvanceManager advances={advances} />
          </SalarySheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}