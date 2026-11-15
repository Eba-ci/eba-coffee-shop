'use client';

// « Payer toute la masse salariale » : un versement par employé qui a un reste
// à payer pour le mois affiché, même date, même mode, UN seul appel serveur.
// Tiroir monté à l'ouverture seulement (état et clé d'idempotence propres).

import { useRef, useState, useTransition } from 'react';
import { HandCoins, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { nextMonth } from '@/lib/salaries/month';
import { settlePayrollAction } from '../../salary-actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from '../employee-sheet';
import { SALARY_PAYMENT_METHOD_LABELS } from './format';
import { PayrollLine, type PayrollRow } from './payroll-line';

const METHODS = ['WAVE', 'CASH', 'BANK', 'OTHER'] as const;

export type { PayrollRow };

function Form({
  month,
  rows,
  onClose,
}: {
  month: string;
  rows: PayrollRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.map((r) => r.id))
  );
  const [date, setDate] = useState(`${nextMonth(month)}-01`);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('WAVE');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(crypto.randomUUID());

  // Montant par ligne : le reste entier par défaut, modifiable (≤ reste).
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const amountOf = (r: PayrollRow) => amounts[r.id] ?? r.remaining;

  const chosen = rows.filter((r) => selected.has(r.id));
  const total = chosen.reduce((a, r) => a + amountOf(r), 0);
  const unpaidTotal = chosen.reduce(
    (a, r) => a + Math.max(0, r.remaining - amountOf(r)),
    0
  );
  const touch = () => {
    keyRef.current = crypto.randomUUID();
    setError(null);
  };

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    touch();
  }

  function setAmount(id: string, value: string) {
    setAmounts((a) => ({ ...a, [id]: Math.round(Number(value)) || 0 }));
    touch();
  }

  function submit() {
    if (chosen.length === 0) return setError('Aucun employé sélectionné');
    const bad = chosen.find((c) => !(amountOf(c) > 0));
    if (bad) return setError(`${bad.name} : montant invalide`);
    const over = chosen.find((c) => amountOf(c) > c.remaining);
    if (over) {
      return setError(`${over.name} : le montant dépasse le reste à payer`);
    }
    if (!date) return setError('Choisissez la date du versement');
    startTransition(async () => {
      const r = await settlePayrollAction({
        month,
        date,
        paymentMethod: method,
        idempotencyKey: keyRef.current,
        items: chosen.map((c) => ({ employeeId: c.id, amount: amountOf(c) })),
      });
      if (r.ok) {
        onClose();
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <>
      <EmployeeSheetBody>
        <div className="space-y-1.5">
          <Label htmlFor="payroll-date">Date du versement</Label>
          <Input
            id="payroll-date"
            className="h-11"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              touch();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Par défaut le 1er du mois suivant, jour de la paie habituelle.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payroll-method">Mode de paiement</Label>
          <Select
            value={method}
            onValueChange={(v) => {
              setMethod(v as (typeof METHODS)[number]);
              touch();
            }}
          >
            <SelectTrigger id="payroll-method" className="h-11 w-full">
              <SelectValue>{SALARY_PAYMENT_METHOD_LABELS[method]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {SALARY_PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Employés à payer</legend>
          {rows.map((r) => (
            <PayrollLine
              key={r.id}
              row={r}
              month={month}
              checked={selected.has(r.id)}
              amount={amountOf(r)}
              onToggle={(on) => toggle(r.id, on)}
              onAmount={(v) => setAmount(r.id, v)}
            />
          ))}
        </fieldset>

        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          {chosen.length} versement{chosen.length > 1 ? 's' : ''} →{' '}
          <span className="font-medium">
            1 dépense « Masse salariale » de {money(total)}
          </span>
          {unpaidTotal > 0 && (
            <span className="mt-1 block text-amber-900 dark:text-amber-200">
              Il restera {money(unpaidTotal)} d’impayé sur {monthLabel(month)}{' '}
              après ce lot.
            </span>
          )}
        </p>
        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button
          className="h-11 w-full"
          onClick={submit}
          disabled={pending || chosen.length === 0}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <HandCoins className="size-4" />
          )}
          Payer {money(total)}
        </Button>
      </EmployeeSheetActions>
    </>
  );
}

export function PayrollDrawer({
  month,
  rows,
}: {
  month: string;
  rows: PayrollRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="h-11"
        onClick={() => setOpen(true)}
        disabled={rows.length === 0}
      >
        <HandCoins className="size-4" aria-hidden="true" />
        Payer toute la paie
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
          <EmployeeSheetHeader
            title="Payer toute la paie"
            description={`Salaires de ${monthLabel(month)}, un versement par employé.`}
          />
          {open && (
            <Form month={month} rows={rows} onClose={() => setOpen(false)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
