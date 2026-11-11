'use client';

import { useRef, useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SALARY_PAYMENT_TYPE_LABELS,
  SALARY_PAYMENT_TYPES,
  type SalaryPaymentTypeValue,
} from '@/lib/schemas/salary';
import { SALARY_PAYMENT_METHOD_LABELS } from './format';
import { recordSalaryPaymentAction } from './actions';

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
}: {
  employees: { id: string; name: string }[];
  defaultMonth: string;
  today: string;
}) {
  const [draft, setDraft] = useState<Draft>({
    employeeId: employees[0]?.id ?? '',
    type: 'SALAIRE',
    date: today,
    month: defaultMonth,
    amount: '',
    paymentMethod: 'CASH',
    recoveryMonths: '1',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
    if (!draft.employeeId) return setError('Choisis un employé');
    if (!(amount > 0)) return setError('Montant invalide');
    if (!/^\d{4}-\d{2}$/.test(draft.month)) return setError('Mois invalide');
    if (!draft.date) return setError('Date requise');
    setError(null);
    setInfo(null);
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
        setInfo('Versement enregistré.');
        setDraft((d) => ({ ...d, amount: '', note: '' }));
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="sal-emp">Employé</Label>
          <select
            id="sal-emp"
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={draft.employeeId}
            onChange={(e) => set('employeeId', e.target.value)}
          >
            {employees.length === 0 && <option value="">Aucun employé</option>}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sal-type">Type</Label>
          <select
            id="sal-type"
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={draft.type}
            onChange={(e) =>
              set('type', e.target.value as SalaryPaymentTypeValue)
            }
          >
            {SALARY_PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SALARY_PAYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sal-amount">Montant (FCFA)</Label>
          <Input
            id="sal-amount"
            className="h-11"
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="ex. 150000"
          />
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor="sal-method">Mode de paiement</Label>
          <select
            id="sal-method"
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={draft.paymentMethod}
            onChange={(e) =>
              set('paymentMethod', e.target.value as Draft['paymentMethod'])
            }
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {SALARY_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        {draft.type === 'AVANCE' && (
          <div className="space-y-1.5">
            <Label htmlFor="sal-recovery">Étalement (mois)</Label>
            <Input
              id="sal-recovery"
              className="h-11"
              type="number"
              min={1}
              max={60}
              value={draft.recoveryMonths}
              onChange={(e) => set('recoveryMonths', e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="sal-note">Note (facultatif)</Label>
          <Input
            id="sal-note"
            className="h-11"
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="ex. paie de juin, deuxième tranche"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}

      <Button
        className="h-11"
        onClick={submit}
        disabled={pending || employees.length === 0}
      >
        {pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-1.5 h-4 w-4" />
        )}
        Enregistrer le versement
      </Button>
    </div>
  );
}
