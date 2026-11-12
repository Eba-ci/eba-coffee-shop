'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import type { BatchLineResult } from '@/lib/fixed-costs/batch-payments';
import { payOccurrencesBatchAction } from './batch-actions';

export const occKey = (o: { costId: string; dueDate: string }) =>
  `${o.costId}|${o.dueDate}`;

/** Sélection d'échéances + envoi en lot ; la sélection survit à une erreur. */
export function useBatchSelection(selectable: Occurrence[]) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BatchLineResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
    setError(null);
    batchKey.current = null;
  }

  function submit() {
    if (pending || chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await payOccurrencesBatchAction({
        targets: chosen.map((o) => ({ costId: o.costId, dueDate: o.dueDate })),
        batchKey: (batchKey.current ??= crypto.randomUUID()),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResults(res.results);
      const failed = res.results.filter((r) => r.status === 'failed');
      // Réglées ou déjà réglées : on les retire ; les échecs restent cochés.
      setSelected(new Set(failed.map(occKey)));
      if (failed.length === 0) batchKey.current = null;
      router.refresh();
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
