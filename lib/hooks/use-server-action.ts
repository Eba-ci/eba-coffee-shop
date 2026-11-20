'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  guardedRun,
  SERVER_ACTION_TIMEOUT_MESSAGE,
  type ServerActionResult,
} from './guarded-run';

export type { ServerActionResult };

export const SERVER_ACTION_TIMEOUT_MS = 20_000;

/**
 * Porte `pending`, l'erreur visible et un délai maximal pour une server
 * action. Au-delà du délai, un message s'affiche mais l'action n'est JAMAIS
 * relancée ni abandonnée : `pending` reste vrai tant qu'elle n'a pas répondu,
 * pour qu'un second clic ne produise pas une double écriture.
 *
 * Aucun `router.refresh()` ici : l'action revalide elle-même le chemin affiché
 * (`revalidatePath`), la réponse porte déjà l'arbre RSC à jour.
 */
export function useServerAction(timeoutMs = SERVER_ACTION_TIMEOUT_MS) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    <R extends ServerActionResult>(
      fn: () => Promise<R>,
      onSuccess?: (result: Extract<R, { ok: true }>) => void
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      startTransition(async () => {
        await guardedRun(fn, {
          timeoutMs,
          onTimeout: () => {
            if (mounted.current) setError(SERVER_ACTION_TIMEOUT_MESSAGE);
          },
          onOk: (result) => {
            setError(null);
            onSuccess?.(result);
          },
          onError: setError,
        });
        inFlight.current = false;
      });
    },
    [timeoutMs]
  );

  return { run, pending, error, setError, clearError: () => setError(null) };
}
