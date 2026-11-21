// lib/hooks/sse-leader.ts
//
// Dédoublonnage des connexions SSE entre plusieurs onglets d'un même poste
// (caisse ou cuisine). Sans ça, chaque onglet ouvert ouvre sa propre
// connexion `EventSource` ET peut déclencher son propre recalcul complet de
// la file côté serveur (~6 requêtes pour la caisse) si les timers de debounce
// des différents onglets ne se chevauchent pas — un vrai gaspillage
// proportionnel au nombre d'onglets ouverts.
//
// `startSseLeader` élit UN onglet "leader" par `endpoint` via la Web Locks
// API : lui seul appelle `openConnection` (vraie connexion réseau). Les
// autres onglets ("followers") reçoivent, via `BroadcastChannel`, chaque
// snapshot ET chaque changement d'état de connexion relayés par le leader —
// pas seulement les données : un follower ne doit jamais afficher "connecté"
// pendant que le leader est en train de se reconnecter.
//
// Fallback obligatoire, sans régression : si la Web Locks API ou
// `BroadcastChannel` sont absentes (support navigateur), chaque onglet garde
// le comportement actuel — connexion indépendante, comme avant cet ajout.

import type { ConnState } from './use-orders-stream';

export type SseSnapshotMessage = { type: 'snapshot'; data: unknown[] };
export type SseConnStateMessage = { type: 'connState'; data: ConnState };
// `hello` : un nouvel arrivant (onglet ou composant) demande au leader de lui
// rejouer le dernier snapshot et l'état de connexion, sans attendre le prochain
// changement (sinon il ne saurait pas ce qui existait déjà).
type SseHelloMessage = { type: 'hello' };
type SseLeaderMessage =
  | SseSnapshotMessage
  | SseConnStateMessage
  | SseHelloMessage;

/** Vrai si le navigateur supporte la Web Locks API (`navigator.locks`). */
export function hasWebLocksSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'locks' in navigator &&
    navigator.locks != null
  );
}

/**
 * Ouvre la connexion réelle (typiquement un `EventSource`) UNIQUEMENT sur
 * l'onglet élu leader ; retourne une fonction de cleanup (fermeture de la
 * connexion). Signature calquée sur le `connect()` interne historique de
 * `use-orders-stream.ts`.
 */
export type OpenSseConnection = (
  onSnapshot: (raw: unknown[]) => void,
  onConnState: (state: ConnState) => void
) => () => void;

/**
 * Élit un leader par `endpoint` (un poste avec un onglet caisse ET un onglet
 * cuisine ouverts aura un leader distinct par flux — ce sont deux flux
 * indépendants). Retourne une fonction de cleanup à appeler au démontage.
 */
export function startSseLeader(
  endpoint: string,
  openConnection: OpenSseConnection,
  onSnapshot: (raw: unknown[]) => void,
  onConnState: (state: ConnState) => void
): () => void {
  if (!hasWebLocksSupport() || typeof BroadcastChannel === 'undefined') {
    return openConnection(onSnapshot, onConnState);
  }

  let cancelled = false;
  let isLeader = false;
  let closeConnection: (() => void) | null = null;
  let releaseLock: (() => void) | null = null;
  let lastSnapshot: unknown[] | null = null;
  let lastConnState: ConnState | null = null;

  const channel = new BroadcastChannel(`eba-sse-${endpoint}`);
  channel.onmessage = (event: MessageEvent<SseLeaderMessage>) => {
    // Le leader applique déjà les mises à jour localement avant diffusion —
    // et `BroadcastChannel` ne renvoie de toute façon jamais l'émetteur à
    // lui-même (garde défensive, sans effet en pratique).
    const msg = event.data;
    if (isLeader) {
      if (msg.type === 'hello') {
        if (lastConnState) {
          channel.postMessage({
            type: 'connState',
            data: lastConnState,
          } satisfies SseConnStateMessage);
        }
        if (lastSnapshot) {
          channel.postMessage({
            type: 'snapshot',
            data: lastSnapshot,
          } satisfies SseSnapshotMessage);
        }
      }
      return;
    }
    if (msg.type === 'snapshot') onSnapshot(msg.data);
    else if (msg.type === 'connState') onConnState(msg.data);
  };

  channel.postMessage({ type: 'hello' } satisfies SseHelloMessage);

  navigator.locks
    .request(`eba-sse-leader-${endpoint}`, () => {
      return new Promise<void>((resolveLock) => {
        releaseLock = resolveLock;
        if (cancelled) {
          resolveLock();
          return;
        }
        isLeader = true;
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`[SSE] leader (${endpoint})`);
        }
        closeConnection = openConnection(
          (raw) => {
            lastSnapshot = raw;
            onSnapshot(raw);
            channel.postMessage({
              type: 'snapshot',
              data: raw,
            } satisfies SseSnapshotMessage);
          },
          (state) => {
            lastConnState = state;
            onConnState(state);
            channel.postMessage({
              type: 'connState',
              data: state,
            } satisfies SseConnStateMessage);
          }
        );
        // Le lock reste tenu tant que cette promesse n'est pas résolue —
        // c'est-à-dire tant que le composant est monté (cf. cleanup ci-dessous).
      });
    })
    .catch(() => {
      // Web Locks présente mais en échec à l'exécution (rare) : repli direct,
      // sans dédoublonnage — préférable à ne recevoir aucune donnée.
      if (!cancelled && !isLeader) {
        closeConnection = openConnection(onSnapshot, onConnState);
      }
    });

  return () => {
    cancelled = true;
    channel.close();
    closeConnection?.();
    releaseLock?.();
  };
}
