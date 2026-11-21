'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playOrderSound } from './chimes';

/** Clé unique : caisse, cuisine et écouteur global partagent le même réglage. */
export const SOUND_STORAGE_KEY = 'eba.sound-enabled';
// Anciennes clés par écran : « coupé » sur l'une d'elles reste coupé.
const LEGACY_KEYS = [
  'eba.caisse.sound-enabled',
  'eba.preparation.sound-enabled',
];
const SYNC_EVENT = 'eba:sound-pref';

function readEnabled(storageKey: string): boolean {
  try {
    if (localStorage.getItem(storageKey) === 'false') return false;
    if (storageKey === SOUND_STORAGE_KEY) {
      return !LEGACY_KEYS.some((k) => localStorage.getItem(k) === 'false');
    }
  } catch {
    // localStorage indisponible : son activé par défaut.
  }
  return true;
}

/** Mémorise « son activé » dans localStorage, synchronisé entre composants, avec une ref pour les callbacks SSE. */
export function useSoundPreference(storageKey: string = SOUND_STORAGE_KEY): {
  soundEnabled: boolean;
  soundEnabledRef: React.MutableRefObject<boolean>;
  toggleSound: () => void;
} {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    const sync = () => {
      const enabled = readEnabled(storageKey);
      soundEnabledRef.current = enabled;
      setSoundEnabled(enabled);
    };
    sync();
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [storageKey]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    try {
      localStorage.setItem(storageKey, String(next));
      if (next) LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Quota / mode privé : on ignore.
    }
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    window.dispatchEvent(new Event(SYNC_EVENT));
    if (next) playOrderSound();
  }, [storageKey]);

  return { soundEnabled, soundEnabledRef, toggleSound };
}
