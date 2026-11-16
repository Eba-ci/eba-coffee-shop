// Cœur pur de `useServerAction` (testable sans React) : exécute une action,
// signale un dépassement de délai SANS l'interrompre ni la relancer.

export type ServerActionResult = { ok: true } | { ok: false; error: string };

export const SERVER_ACTION_TIMEOUT_MESSAGE =
  'Le serveur met trop de temps, vérifie le résultat avant de réessayer.';
export const SERVER_ACTION_FAILURE_MESSAGE =
  'La requête a échoué, vérifie le résultat avant de réessayer.';

export async function guardedRun<R extends ServerActionResult>(
  fn: () => Promise<R>,
  opts: {
    timeoutMs: number;
    onTimeout: () => void;
    onOk: (result: Extract<R, { ok: true }>) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const timer = setTimeout(opts.onTimeout, opts.timeoutMs);
  try {
    const result = await fn();
    if (result.ok) opts.onOk(result as Extract<R, { ok: true }>);
    else opts.onError(result.error);
  } catch {
    opts.onError(SERVER_ACTION_FAILURE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}
