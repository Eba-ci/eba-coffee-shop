// Son « nouvelle commande » : UN seul son pour tout le dashboard.
// Fichier court (`public/sounds/new-order.mp3`) décodé une fois dans un
// AudioContext partagé ; si le fichier manque ou ne se décode pas, un bip de
// secours évite le silence. Le contexte est débloqué au premier geste
// (`installAudioUnlock`) : sans cela, un écran de caisse jamais touché reste muet.

const SOUND_URL = '/sounds/new-order.mp3';
const VIBRATION = [600, 150, 600];
const FADE_OUT_S = 0.4;

export type AudioState = 'running' | 'suspended' | 'unsupported';

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
let unlockInstalled = false;
const stateListeners = new Set<() => void>();

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  ctx.addEventListener('statechange', () =>
    stateListeners.forEach((listener) => listener())
  );
  return ctx;
}

export function getAudioState(): AudioState {
  if (typeof window === 'undefined') return 'running';
  const c = getContext();
  if (!c) return 'unsupported';
  return c.state === 'running' ? 'running' : 'suspended';
}

export function subscribeAudioState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Relance le contexte (à appeler depuis un geste utilisateur). */
export async function ensureAudioReady(): Promise<boolean> {
  const c = getContext();
  if (!c) return false;
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      // Refusé par le navigateur : pas de geste récent.
    }
  }
  return c.state === 'running';
}

/** Charge et décode le fichier une fois ; un échec laisse le bip de secours. */
export function preloadOrderSound(): Promise<void> {
  const c = getContext();
  if (!c) return Promise.resolve();
  loading ??= fetch(SOUND_URL)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(res.status)))
    .then((data) => c.decodeAudioData(data))
    .then((decoded) => {
      buffer = decoded;
    })
    .catch(() => {
      buffer = null;
    });
  return loading;
}

/** Débloque l'audio au premier geste (clic, touche, toucher), une seule fois. */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockInstalled) return;
  unlockInstalled = true;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const unlock = () => {
    void ensureAudioReady().then((ready) => {
      if (!ready) return;
      events.forEach((e) => window.removeEventListener(e, unlock));
      unlockInstalled = false;
    });
  };
  events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  getContext();
  const idle =
    window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 500));
  idle(() => void preloadOrderSound());
}

function playBeep(c: AudioContext) {
  const now = c.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(c.destination);
    const start = now + i * 0.25;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.6, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}

/** Joue le son « nouvelle commande ». */
export function playOrderSound(): void {
  const c = getContext();
  if (!c) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(VIBRATION);
  }
  void ensureAudioReady().then((ready) => {
    if (!ready) return;
    if (buffer) {
      const source = c.createBufferSource();
      const gain = c.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(c.destination);
      // Fondu de sortie : le fichier est coupé net, sans queue de cloche.
      const end = c.currentTime + buffer.duration;
      gain.gain.setValueAtTime(1, Math.max(c.currentTime, end - FADE_OUT_S));
      gain.gain.linearRampToValueAtTime(0, end);
      source.start();
    } else {
      playBeep(c);
      void preloadOrderSound();
    }
  });
}
