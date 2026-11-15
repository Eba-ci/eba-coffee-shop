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

const METHODS = ['WAVE', 'CASH', 'BANK', 'OTHER'] as const;

export type PayrollRow = { id: string; name: string; remaining: number };

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

  const chosen = rows.filter((r) => selected.has(r.id));
  const total = chosen.reduce((a, r) => a + r.remaining, 0);
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

  function submit() {
    if (chosen.length === 0) return setError('Aucun employé sélectionné');
    if (!date) return setError('Choisissez la date du versement');
    startTransition(async () => {
      const r = await settlePayrollAction({
        month,
        date,
        paymentMethod: method,
        idempotencyKey: keyRef.current,
        items: chosen.map((c) => ({ employeeId: c.id, amount: c.remaining })),
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
            <label
              key={r.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={selected.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="tabular-nums">{money(r.remaining)}</span>
            </label>
          ))}
        </fieldset>

        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          {chosen.length} versement{chosen.length > 1 ? 's' : ''} →{' '}
          <span className="font-medium">
            1 dépense « Masse salariale » de {money(total)}
          </span>
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
