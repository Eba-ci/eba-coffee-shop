'use client';

import { useServerAction } from '@/lib/hooks/use-server-action';
import { useState } from 'react';
import {
  createPollAction,
  setPollStatusAction,
  deletePollAction,
} from '../../actions';
import { emptyCreate, type CreateValues, type PollRow } from './types';

export type PollsTableState = ReturnType<typeof usePollsTable>;

export function usePollsTable() {
  const { run, pending, error, setError } = useServerAction();
  const [pendingId, setPendingId] = useState<string | null>(null);

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
    run(
      () => createPollAction(input),
      () => {
        setCreateOpen(false);
      }
    );
  }

  function changeStatus(id: string, status: PollRow['status']) {
    setError(null);
    setPendingId(id);
    run(() =>
      setPollStatusAction(id, { status }).finally(() => setPendingId(null))
    );
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
    run(() => deletePollAction(poll.id).finally(() => setPendingId(null)));
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
