// lib/stock-history/test-mocks.ts
//
// Doublures du journal de stock pour les tests qui exercent des mutations de
// stock sans s'intéresser au journal. Usage (le `vi.mock` doit être au premier
// niveau du fichier de test, il est remonté par vitest) :
//
//   vi.mock('@/lib/stock-history/record', async () =>
//     (await import('@/lib/stock-history/test-mocks')).recordMock()
//   );

import { vi } from 'vitest';

export function recordMock() {
  return {
    logStockChange: vi.fn(async () => undefined),
    logStockSet: vi.fn(async () => undefined),
    logStockAnomaly: vi.fn(async () => undefined),
  };
}

export function lifecycleMock() {
  return {
    logCreated: vi.fn(async () => undefined),
    logOptionsRemoved: vi.fn(async () => undefined),
  };
}

/** `before` fixé à 5 : suffisant pour les tests qui ne regardent pas le journal. */
export function lockMock() {
  return { lockStock: vi.fn(async () => 5) };
}
