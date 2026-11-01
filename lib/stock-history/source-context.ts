// lib/stock-history/source-context.ts
//
// Contexte ambiant du journal de stock : les outils MCP (et l'assistant, qui les
// réutilise) appellent les mêmes mutations que l'application, sans leur passer
// d'acteur. Plutôt que de propager un paramètre dans chaque couche, le point
// d'entrée enveloppe l'appel : `logStock*` lit la source ici quand le mouvement
// n'en précise pas.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { StockSource } from './types';

type AmbientStockContext = { source: StockSource; actorId?: string | null };

const storage = new AsyncLocalStorage<AmbientStockContext>();

export function runWithStockContext<T>(
  ctx: AmbientStockContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(ctx, fn);
}

export function ambientStockContext(): AmbientStockContext | undefined {
  return storage.getStore();
}
