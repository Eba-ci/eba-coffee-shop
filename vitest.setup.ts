// Les stores Zustand persistés écrivent dans `localStorage`, absent de
// l'environnement de test Node : on fournit un stockage en mémoire.
const hasStorage =
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.setItem === 'function';

if (!hasStorage) {
  const data = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memory,
    configurable: true,
    writable: true,
  });
}
