'use client';

import { useState, useTransition } from 'react';
import {
  createPollAction,
  setPollStatusAction,
  deletePollAction,
} from '../../actions';
import { emptyCreate, type CreateValues, type PollRow } from './types';

export type PollsTableState = ReturnType<typeof usePollsTable>;

export function usePollsTable() {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [values, setValues] = useState<CreateValues>(emptyCreate);

  function openCreate() {
    setError(null);
    setValues(emptyCreate);
    setCreateOpen(true);
  }

  function submitCreate() {
    setError(null);
    const title = values.title.trim();
    if (!title) {
      setError('Le titre est obligatoire.');
      return;
    }
    const options = values.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      setError('Au moins 2 options sont requises.');
      return;
    }
    const input = {
      title,
      description: values.description.trim() || undefined,
      imageUrl: values.imageUrl,
      allowSuggestions: values.allowSuggestions,
      resultsVisibility: values.resultsVisibility,
      options: options.map((label) => ({ label })),
    };
    startTransition(async () => {
      const r = await createPollAction(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCreateOpen(false);
    });
  }

  function changeStatus(id: string, status: PollRow['status']) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await setPollStatusAction(id, { status });
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function remove(poll: PollRow) {
    if (
      !window.confirm(
        `Supprimer le sondage « ${poll.title} » ? Action irréversible.`
      )
    ) {
      return;
    }
    setError(null);
    setPendingId(poll.id);
    startTransition(async () => {
      const r = await deletePollAction(poll.id);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  return {
    pending,
    pendingId,
    error,
    createOpen,
    setCreateOpen,
    values,
    setValues,
    openCreate,
    submitCreate,
    changeStatus,
    remove,
  };
}
