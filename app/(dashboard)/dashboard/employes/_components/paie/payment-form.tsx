'use client';

import { useRef, useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import {
  SALARY_PAYMENT_TYPE_LABELS,
  SALARY_PAYMENT_TYPES,
  type SalaryPaymentTypeValue,
} from '@/lib/schemas/salary';
import {
  EmployeeSheetActions,
  EmployeeSheetBody,
  FieldError,
} from '../employee-sheet';
import { SALARY_PAYMENT_METHOD_LABELS } from './format';
import { recordSalaryPaymentAction } from '../../salary-actions';

const METHODS = ['CASH', 'WAVE', 'BANK', 'OTHER'] as const;

type Draft = {
  employeeId: string;
  type: SalaryPaymentTypeValue;
  date: string;
  month: string;
  amount: string;
  paymentMethod: (typeof METHODS)[number];
  recoveryMonths: string;
  note: string;
};

/**
 * Saisie d'un versement (salaire, acompte, avance). Protection contre le double
 * clic : une clé d'idempotence est générée à la première soumission et réutilisée
 * tant que le formulaire n'a pas changé ; le serveur refuse alors le doublon.
 */
export function SalaryPaymentForm({
  employees,
  defaultMonth,
  today,
  defaultEmployeeId,
  onSaved,
}: {
  employees: { id: string; name: string }[];
  defaultMonth: string;
  today: string;
  /** Employé présélectionné (ligne de la liste Employés). */
  defaultEmployeeId?: string;
  /** Appelé après un versement enregistré (le tiroir se referme). */
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    employeeId: defaultEmployeeId ?? employees[0]?.id ?? '',
    type: 'SALAIRE',
    date: today,
    month: defaultMonth,
    amount: '',
    paymentMethod: 'WAVE',
    recoveryMonths: '1',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyRef = useRef<string | null>(null);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    // Toute modification invalide la clé en cours : la prochaine soumission
    // part avec un contenu différent, donc une nouvelle clé.
    keyRef.current = null;
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function submit() {
    const amount = Math.round(Number(draft.amount));
    if (!draft.employeeId) return setError('Choisissez un employé');
    if (!(amount > 0)) return setError('Montant invalide');
    if (!/^\d{4}-\d{2}$/.test(draft.month)) return setError('Mois invalide');
    if (!draft.date) return setError('Date requise');
    setError(null);
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    const idempotencyKey = keyRef.current;
    startTransition(async () => {
      const r = await recordSalaryPaymentAction({
        employeeId: draft.employeeId,
        type: draft.type,
        date: draft.date,
        month: draft.month,
        amount,
        paymentMethod: draft.paymentMethod,
        recoveryMonths:
          draft.type === 'AVANCE'
            ? Math.round(Number(draft.recoveryMonths)) || 1
            : undefined,
        note: draft.note.trim() || null,
        idempotencyKey,
      });
      if (r.ok) {
        keyRef.current = null;
        setDraft((d) => ({ ...d, amount: '', note: '' }));
        onSaved?.();
      } else {
        setError(r.error);
      }
    });
  }

  const employeeName = employees.find((e) => e.id === draft.employeeId)?.name;

  return (
    <>
      <EmployeeSheetBody>
        <div className="space-y-1.5">
          <Label htmlFor="sal-emp">Employé</Label>
          <Select
            value={draft.employeeId}
            onValueChange={(v) => set('employeeId', v)}
            disabled={employees.length === 0}
          >
            <SelectTrigger id="sal-emp" className="h-11 w-full">
              <SelectValue placeholder="Aucun employé">
                {employeeName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sal-type">Type</Label>
          <Select
            value={draft.type}
            onValueChange={(v) => set('type', v as SalaryPaymentTypeValue)}
          >
            <SelectTrigger id="sal-type" className="h-11 w-full">
              <SelectValue>
                {SALARY_PAYMENT_TYPE_LABELS[draft.type]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SALARY_PAYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {SALARY_PAYMENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sal-amount">Montant (FCFA)</Label>
          <Input
            id="sal-amount"
            className="h-11 tabular-nums"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="ex. 150000"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sal-date">Date du versement</Label>
            <Input
              id="sal-date"
              className="h-11"
              type="date"
              value={draft.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-month">Mois concerné</Label>
            <Input
              id="sal-month"
              className="h-11"
              type="month"
              value={draft.month}
              onChange={(e) => set('month', e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sal-method">Mode de paiement</Label>
          <Select
            value={draft.paymentMethod}
            onValueChange={(v) =>
              set('paymentMethod', v as Draft['paymentMethod'])
            }
          >
            <SelectTrigger id="sal-method" className="h-11 w-full">
              <SelectValue>
                {SALARY_PAYMENT_METHOD_LABELS[draft.paymentMethod]}
              </SelectValue>
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

        {draft.type === 'AVANCE' && (
          <div className="space-y-1.5">
            <Label htmlFor="sal-recovery">Étalement (mois)</Label>
            <Input
              id="sal-recovery"
              className="h-11"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={draft.recoveryMonths}
              onChange={(e) => set('recoveryMonths', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              L’avance est récupérée automatiquement sur les paies suivantes,
              réparties sur ce nombre de mois.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="sal-note">Note (facultatif)</Label>
          <Input
            id="sal-note"
            className="h-11"
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="ex. paie de juin, deuxième tranche"
          />
        </div>

        {error && <FieldError>{error}</FieldError>}
      </EmployeeSheetBody>

      <EmployeeSheetActions>
        <Button
          className="h-11 w-full"
          onClick={submit}
          disabled={pending || employees.length === 0}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Enregistrer le versement
        </Button>
      </EmployeeSheetActions>
    </>
  );
}
