'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money } from './status';
import type { BatchLineResult } from '@/lib/fixed-costs/batch-payments';

const STATUS_LABEL = {
  created: 'Enregistrée',
  skipped: 'Déjà réglée',
  failed: 'Échec',
} as const;

/** Barre d'action du mode sélection : total, validation, compte rendu. */
export function BatchBar({
  count,
  total,
  pending,
  error,
  results,
  onSubmit,
  onCancel,
}: {
  count: number;
  total: number;
  pending: boolean;
  error: string | null;
  results: BatchLineResult[] | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const failed = results?.filter((r) => r.status === 'failed') ?? [];
  return (
    <div className="mt-3 space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && (
        <ul
          className="space-y-1 rounded-lg border p-3 text-sm"
          aria-live="polite"
        >
          {results.map((r) => (
            <li
              key={`${r.costId}-${r.dueDate}`}
              className="flex flex-wrap justify-between gap-x-2"
            >
              <span className="min-w-0 break-words">{r.label ?? r.costId}</span>
              <span
                className={
                  r.status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }
              >
                {STATUS_LABEL[r.status]}
                {r.status === 'created' && r.amount
                  ? ` · ${money(r.amount)}`
                  : ''}
                {r.status === 'failed' && r.message ? ` · ${r.message}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Les échéances en échec restent sélectionnées : corrigez puis
          réessayez, les autres ne seront pas enregistrées deux fois.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground">
          {count} sélectionnée{count > 1 ? 's' : ''} · {money(total)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="h-11"
            disabled={pending}
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            className="h-11"
            disabled={pending || count === 0}
            onClick={onSubmit}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer les paiements
          </Button>
        </div>
      </div>
    </div>
  );
}
