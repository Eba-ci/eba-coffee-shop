'use client';

// Flux SSE des écrans dashboard (caisse, préparation), sons d'alerte et préférence sonore. Implémentation dans `lib/hooks/orders-stream/`.

export {
  DEFAULT_STALE_AFTER_MS,
  computeIsStale,
  useOrdersStream,
} from './orders-stream/stream';
export type {
  ConnState,
  UseOrdersStreamOptions,
  UseOrdersStreamResult,
} from './orders-stream/stream';
export {
  ensureAudioReady,
  getAudioState,
  installAudioUnlock,
  playOrderSound,
  subscribeAudioState,
} from './orders-stream/chimes';
export type { AudioState } from './orders-stream/chimes';
export {
  SOUND_STORAGE_KEY,
  useSoundPreference,
} from './orders-stream/sound-preference';
