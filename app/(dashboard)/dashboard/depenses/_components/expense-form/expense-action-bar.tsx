'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExpenseFormState } from './use-expense-form';

const priceFmt = new Intl.NumberFormat('fr-FR');

export function ExpenseActionBar({
  form,
  embedded = false,
  submitLabel,
}: {
  form: ExpenseFormState;
  embedded?: boolean;
  submitLabel?: string;
}) {
  const { values, detailed, total, busy, pending, mode, router, cancelHref } =
    form;
  return (
    <div
      className={cn(
        'sticky bottom-0 border-t bg-background py-3',
        !embedded && '-mx-4 px-4 sm:-mx-6 sm:px-6'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {detailed
            ? `${values.items.length} article${values.items.length > 1 ? 's' : ''} · `
            : ''}
          Total{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {priceFmt.format(detailed ? total : Number(values.amount) || 0)} F
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className={cn(embedded && 'h-11')}
            disabled={busy}
            onClick={() =>
              form.onCancel ? form.onCancel() : router.push(cancelHref)
            }
          >
            Annuler
          </Button>
          <Button
            onClick={form.submit}
            disabled={busy}
            className={cn(embedded && 'h-11', busy && 'opacity-70')}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {submitLabel ??
              (mode === 'edit'
                ? 'Enregistrer les modifications'
                : 'Enregistrer la dépense')}
          </Button>
        </div>
      </div>
    </div>
  );
}
