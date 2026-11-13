'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FIXED_COST_PERIODICITIES,
  FIXED_COST_PERIODICITY_LABELS,
  type FixedCostPeriodicityValue,
} from '@/lib/schemas/fixed-cost';
import { todayDateString } from '@/lib/timezone';
import {
  FixedCostInstallments,
  type InstallmentDraft,
} from './fixed-cost-installments';

const selectClass =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export type Draft = {
  label: string;
  amount: string;
  periodicity: FixedCostPeriodicityValue;
  startDate: string;
  endDate: string;
  categoryId: string;
  /** Vide = échéance par défaut déduite de la prise d'effet. */
  installments: InstallmentDraft[];
};

export function emptyDraft(categoryId: string): Draft {
  return {
    label: '',
    amount: '',
    periodicity: 'MONTHLY',
    startDate: todayDateString(),
    endDate: '',
    categoryId,
    installments: [],
  };
}

export function FixedCostFields({
  draft,
  set,
  categories,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="fc-label" label="Libellé">
          <Input
            id="fc-label"
            className="h-11"
            value={draft.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Ex. Loyer"
          />
        </Field>
        <Field id="fc-cat" label="Catégorie de dépense">
          <select
            id="fc-cat"
            className={selectClass}
            value={draft.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="fc-amount" label="Montant (F)">
          <Input
            id="fc-amount"
            className="h-11"
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </Field>
        <Field id="fc-period" label="Périodicité">
          <select
            id="fc-period"
            className={selectClass}
            value={draft.periodicity}
            onChange={(e) =>
              set('periodicity', e.target.value as FixedCostPeriodicityValue)
            }
          >
            {FIXED_COST_PERIODICITIES.map((p) => (
              <option key={p} value={p}>
                {FIXED_COST_PERIODICITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="fc-start" label="Prise d’effet">
          <Input
            id="fc-start"
            className="h-11"
            type="date"
            value={draft.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field id="fc-end" label="Fin (optionnel)">
          <Input
            id="fc-end"
            className="h-11"
            type="date"
            value={draft.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </Field>
      </div>
      {draft.periodicity !== 'DAILY' && (
        <FixedCostInstallments
          periodicity={draft.periodicity}
          amount={Math.round(Number(draft.amount)) || 0}
          startDate={draft.startDate}
          installments={draft.installments}
          onChange={(v) => set('installments', v)}
        />
      )}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
