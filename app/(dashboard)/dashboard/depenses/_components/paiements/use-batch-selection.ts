'use client';

import { useRef, useState } from 'react';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import type { BatchLineResult } from '@/lib/fixed-costs/batch-payments';
import { useServerAction } from '@/lib/hooks/use-server-action';
import { payOccurrencesBatchAction } from './batch-actions';

export const occKey = (o: { costId: string; dueDate: string }) =>
  `${o.costId}|${o.dueDate}`;

/** Sélection d'échéances + envoi en lot ; la sélection survit à une erreur. */
export function useBatchSelection(selectable: Occurrence[]) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BatchLineResult[] | null>(null);
  const { run, pending, error, clearError } = useServerAction();
  // Stable pendant toute la session de sélection : rejouer ne double rien.
  const batchKey = useRef<string | null>(null);

  const chosen = selectable.filter((o) => selected.has(occKey(o)));
  const total = chosen.reduce((sum, o) => sum + o.remaining, 0);
  const allSelected =
    selectable.length > 0 && chosen.length === selectable.length;

  function toggle(o: Occurrence) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = occKey(o);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map(occKey)));
  }

  function reset() {
    setActive(false);
    setSelected(new Set());
    setResults(null);
    clearError();
    batchKey.current = null;
  }

  function submit() {
    if (pending || chosen.length === 0) return;
    // L'action revalide /dashboard/depenses : aucun second rendu côté client.
    run(async () => {
      const res = await payOccurrencesBatchAction({
        targets: chosen.map((o) => ({ costId: o.costId, dueDate: o.dueDate })),
        batchKey: (batchKey.current ??= crypto.randomUUID()),
      });
      if (!res.ok) return res;
      setResults(res.results);
      const failed = res.results.filter((r) => r.status === 'failed');
      // Réglées ou déjà réglées : on les retire ; les échecs restent cochés.
      setSelected(new Set(failed.map(occKey)));
      if (failed.length === 0) batchKey.current = null;
      return res;
    });
  }

  return {
    active,
    start: () => setActive(true),
    selected,
    chosen,
    total,
    allSelected,
    toggle,
    toggleAll,
    reset,
    submit,
    pending,
    error,
    results,
  };
}
