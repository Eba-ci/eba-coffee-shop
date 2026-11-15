'use client';

import { useState, useTransition } from 'react';
import { relinkExpenseItemAction } from '../../actions';
import type { ArticleOption } from './types';

export function useRelink(articleId: string, articlesMeta: ArticleOption[]) {
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [relinkTarget, setRelinkTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const relinkTargets = articlesMeta.filter((a) => a.id !== articleId);

  function startRelink(lineId: string) {
    setError(null);
    setRelinkingId(lineId);
    setRelinkTarget(relinkTargets[0]?.id ?? '');
  }

  function confirmRelink(lineId: string) {
    if (!relinkTarget) return;
    setError(null);
    startTransition(async () => {
      const r = await relinkExpenseItemAction(lineId, relinkTarget);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRelinkingId(null);
      // La ligne re-rattachée disparaît : l'action revalide /dashboard/depenses.
    });
  }

  return {
    relinkingId,
    setRelinkingId,
    relinkTarget,
    setRelinkTarget,
    error,
    pending,
    relinkTargets,
    startRelink,
    confirmRelink,
  };
}
