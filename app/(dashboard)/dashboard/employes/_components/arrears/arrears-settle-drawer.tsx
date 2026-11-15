'use client';

// Validation d'un règlement d'arriéré : date, mode, montant par mois, récap.
// Monté à l'ouverture seulement (état et clé d'idempotence propres à chaque
// ouverture). Un seul appel serveur crée tous les versements d'un coup.

import { useRef, useState, useTransition } from 'react';
import { Loader2, HandCoins } from 'lucide-react';
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
import { settleSalaryMonthsAction } from '../../salary-actions';
import {
  EMPLOYEE_SHEET_CLASS,
  EmployeeSheetActions,
  EmployeeSheetBody,
  EmployeeSheetHeader,
  FieldError,
} from '../employee-sheet';
import { SALARY_PAYMENT_METHOD_LABELS } from '../paie/format';
import {
  checkSettle,
  sumAmounts,
  type ArrearsMonth,
  type DateChoice,
} from './settle-plan';

const METHODS = ['WAVE', 'CASH', 'BANK', 'OTHER'] as const;
const CHOICES: { value: DateChoice; label: string; hint: string }[] = [
  {
    value: 'first',
    label: 'Le 1er du mois suivant',
    hint: 'La paie habituelle',
  },
  { value: 'today', label: 'Aujourd’hui', hint: 'Arriéré donné ce mois-ci' },
  { value: 'custom', label: 'Autre date', hint: 'Paiement déjà fait' },
];

function Form({
  employeeId,
  employeeName,
  today,
  months,
  onClose,
  onDone,
}: {
  employeeId: string;
  employeeName: string;
  today: string;
  months: ArrearsMonth[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(months.map((m) => [m.month, String(m.remaining)]))
  );
  const [choice, setChoice] = useState<DateChoice>('first');
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('WAVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(crypto.randomUUID());

  const check = checkSettle(
    months.map((m) => ({ ...m, amount: amounts[m.month] ?? '' })),
    choice,
    today,
    custom
  );
  const total = check.ok ? sumAmounts(check.items) : 0;
  const days = check.ok ? new Set(check.items.map((i) => i.date)).size : 0;

  // Toute modification invalide la clé : un nouveau contenu = un nouveau lot.
  const touch = () => {
    keyRef.current = crypto.randomUUID();
    setError(null);
  };

  function submit() {
    if (!check.ok) return setError(check.error);
    startTransition(async () => {
      const r = await settleSalaryMonthsAction({
        employeeId,
        paymentMethod: method,
        note: note.trim() || null,
        idempotencyKey: keyRef.current,
        items: check.items,
      });
      if (r.ok) {
        onDone();
        onClose();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <>
      <EmployeeSheetBody>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Date du versement</legend>
          <div role="radiogroup" className="grid gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={choice === c.value}
                onClick={() => {
                  setChoice(c.value);
                  touch();
                }}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm aria-checked:border-primary aria-checked:bg-primary/5"
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              </button>
            ))}
          </div>
          {choice === 'custom' && (
            <Input
              aria-label="Date du versement"
              className="h-11"
              type="date"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                touch();
              }}
            />
          )}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="settle-method">Mode de paiement</Label>
          <Select
            value={method}
            onValueChange={(v) => {
              setMethod(v as (typeof METHODS)[number]);
              touch();
            }}
          >
            <SelectTrigger id="settle-method" className="h-11 w-full">
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
          {method === 'CASH' && (
            <p className="text-xs text-muted-foreground">
              Une clôture de caisse déjà enregistrée à cette date n’est pas
              recalculée.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Montant par mois</p>
          {months.map((m) => (
            <div key={m.month} className="space-y-1">
              <Label htmlFor={`settle-${m.month}`} className="font-normal">
                {monthLabel(m.month)}{' '}
                <span className="text-xs text-muted-foreground">
                  (reste {money(m.remaining)})
                </span>
              </Label>
              <Input
                id={`settle-${m.month}`}
                className="h-11 tabular-nums"
                type="number"
                inputMode="numeric"
                min={1}
                max={m.remaining}
                value={amounts[m.month] ?? ''}
                onChange={(e) => {
                  setAmounts((a) => ({ ...a, [m.month]: e.target.value }));
                  touch();
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settle-note">Note (facultatif)</Label>
          <Input
            id="settle-note"
            className="h-11"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              touch();
            }}
            placeholder="ex. arriéré soldé"
          />
        </div>

        {check.ok && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">
            {months.length} versement{months.length > 1 ? 's' : ''} pour{' '}
            {employeeName} →{' '}
            <span className="font-medium">
              {days} dépense{days > 1 ? 's' : ''} « Masse salariale » de{' '}
              {money(total)}
            </span>
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>
      <EmployeeSheetActions>
        <Button className="h-11 w-full" onClick={submit} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <HandCoins className="size-4" />
          )}
          {check.ok ? `Enregistrer ${money(total)}` : 'Enregistrer'}
        </Button>
      </EmployeeSheetActions>
    </>
  );
}

export function ArrearsSettleDrawer({
  open,
  onOpenChange,
  ...form
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  today: string;
  months: ArrearsMonth[];
  onDone: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={EMPLOYEE_SHEET_CLASS}>
        <EmployeeSheetHeader
          title="Régler l’arriéré"
          description={`Un versement par mois sélectionné pour ${form.employeeName}.`}
        />
        {open && <Form {...form} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
