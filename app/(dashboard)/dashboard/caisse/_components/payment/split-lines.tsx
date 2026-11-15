'use client';

import { Input } from '@heroui/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SELECTABLE_PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
} from '@/lib/payment-modes';
import { PaymentMethodIcon } from '@/components/payment-method-badge';
import { priceFormatter } from './format';
import type { PaymentFormState } from './use-payment-form';

export function SplitLines({
  form,
  isSubmitting,
}: {
  form: PaymentFormState;
  isSubmitting: boolean;
}) {
  const { lines, remaining, updateLineMode, updateLineAmount, removeLine } =
    form;
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-border bg-card p-2"
        >
          <div className="grid w-full grid-cols-4 gap-1 sm:w-auto sm:flex-1">
            {SELECTABLE_PAYMENT_MODES.map((value) => {
              const isActive = line.mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  title={PAYMENT_MODE_LABELS[value]}
                  onClick={() => updateLineMode(index, value)}
                  disabled={isSubmitting}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 min-h-11 py-1.5 text-[10px] font-medium transition-colors',
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted'
                  )}
                >
                  <PaymentMethodIcon mode={value} className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <Input
            type="number"
            inputMode="numeric"
            size="sm"
            className="min-w-0 flex-1 sm:w-28 sm:flex-none"
            aria-label="Montant de cette ligne"
            value={String(line.amount)}
            onValueChange={(v) => updateLineAmount(index, v)}
            endContent={<span className="text-xs">F</span>}
            isDisabled={isSubmitting}
          />
          <button
            type="button"
            aria-label="Retirer cette ligne"
            onClick={() => removeLine(index)}
            disabled={isSubmitting}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <p
        className={cn(
          'text-right text-sm font-medium tabular-nums',
          remaining === 0 ? 'text-green-700' : 'text-amber-700'
        )}
      >
        Restant : {priceFormatter.format(remaining)} F
      </p>
    </div>
  );
}
