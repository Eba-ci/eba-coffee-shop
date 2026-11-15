'use client';

// Proposition d'échelonnement : calcul seulement, rien n'est enregistré.
// Fermer le tiroir jette tout. « Préparer le 1er paiement » ne fait que
// préremplir le tiroir de règlement, qui reste le seul à écrire.

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import {
  INSTALMENT_MAX_MONTHS,
  INSTALMENT_MIN_MONTHS,
  isValidInstalmentCount,
  proposeInstalments,
} from '@/lib/salaries/installments';
import { isValidMonth } from '@/lib/salaries/month';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from '../employee-sheet';

function Form({
  total,
  currentMonth,
  onPrepare,
}: {
  total: number;
  currentMonth: string;
  onPrepare: (firstAmount: number) => void;
}) {
  const [count, setCount] = useState('3');
  const [start, setStart] = useState(currentMonth);
  const n = Number(count);
  const countOk = isValidInstalmentCount(n);
  const plan = proposeInstalments(total, n, start);

  return (
    <>
      <EmployeeSheetBody>
        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          Arriéré à étaler : <span className="font-medium">{money(total)}</span>
          . Simple proposition : rien n’est enregistré.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="inst-count">
            Nombre de mois ({INSTALMENT_MIN_MONTHS} à {INSTALMENT_MAX_MONTHS})
          </Label>
          <Input
            id="inst-count"
            className="h-11 tabular-nums"
            type="number"
            inputMode="numeric"
            min={INSTALMENT_MIN_MONTHS}
            max={INSTALMENT_MAX_MONTHS}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          {!countOk && (
            <FieldError>
              Entre {INSTALMENT_MIN_MONTHS} et {INSTALMENT_MAX_MONTHS} mois
            </FieldError>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inst-start">Mois de départ</Label>
          <Input
            id="inst-start"
            className="h-11"
            type="month"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          {!isValidMonth(start) && <FieldError>Mois invalide</FieldError>}
        </div>
        {plan.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {plan.map((p) => (
              <li
                key={p.month}
                className="flex min-h-11 items-center justify-between gap-3 px-3"
              >
                <span>{monthLabel(p.month)}</span>
                <span className="font-medium tabular-nums">
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button
          className="h-11 w-full"
          disabled={plan.length === 0}
          onClick={() => plan[0] && onPrepare(plan[0].amount)}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
          {plan[0]
            ? `Préparer le 1er paiement · ${money(plan[0].amount)}`
            : 'Préparer le 1er paiement'}
        </Button>
      </EmployeeSheetActions>
    </>
  );
}

export function InstalmentProposalDrawer({
  open,
  onOpenChange,
  total,
  currentMonth,
  onPrepare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  currentMonth: string;
  onPrepare: (firstAmount: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <EmployeeSheetHeader
          title="Échelonner l’arriéré"
          description="Proposition de paiements mensuels, sans engagement."
        />
        {open && (
          <Form
            total={total}
            currentMonth={currentMonth}
            onPrepare={onPrepare}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
