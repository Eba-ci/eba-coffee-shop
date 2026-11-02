// Banc d'essai de concurrence du stock : vraies fonctions du dépôt, vraie base Postgres.
// Voir scripts/stock-race/README.md.
import prisma from '@/lib/prisma';
import { createProduct } from '@/lib/menu-mutations';
import { createCashierOrder } from '@/lib/orders/mutations/create-cashier-order';
import {
  StockShortageError,
  OrderMutationError,
} from '@/lib/orders/mutations/errors';
import type { CartItem } from '@/lib/cart-store';
import { runStockAudit } from '@/lib/stock-history/audit';
import { loadOrderLedger } from '@/lib/stock-history/order-audit-query';

export type Prod = {
  id: string;
  name: string;
  options: Record<string, string>;
};

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function mkCategory() {
  return prisma.menuCategory.create({
    data: { name: 'Charge', slug: `charge-${uid()}`, sortOrder: 0 } as never,
  });
}

export async function mkProduct(
  catId: string,
  name: string,
  stock: number | null,
  flavors: [string, number | null][] = []
): Promise<Prod> {
  const p = await createProduct({
    categoryId: catId,
    name: `${name}-${uid()}`,
    description: 'charge',
    price: 500,
    stockQuantity: stock,
    supplementGroups: flavors.length
      ? [
          {
            name: 'Goûts',
            type: 'single',
            kind: 'flavor',
            required: false,
            available: true,
            options: flavors.map(([n, q]) => ({
              name: n,
              price: 0,
              available: true,
              stockQuantity: q,
            })),
          },
        ]
      : [],
  } as never);
  const opts = await prisma.supplementOption.findMany({
    where: { group: { productId: p.id } },
  });
  return {
    id: p.id,
    name: p.name,
    options: Object.fromEntries(opts.map((o) => [o.name, o.id])),
  };
}

export const item = (p: Prod, quantity = 1, flavor?: string): CartItem =>
  ({
    cartId: `c${uid()}`,
    productId: p.id,
    productName: p.name,
    basePrice: 500,
    coutMatiere: 0,
    coutEmballage: 0,
    quantity,
    supplements: flavor
      ? [
          {
            groupName: 'Goûts',
            optionName: flavor,
            price: 0,
            quantity: 1,
            kind: 'flavor',
          },
        ]
      : [],
  }) as CartItem;

/** `launch: true` = la caisse envoie en cuisine à la création (décompte dans la même transaction). */
export const createOrder = (items: CartItem[], launch: boolean) =>
  createCashierOrder({
    items: items as never,
    orderType: 'TAKEAWAY',
    onAccount: launch,
    customerName: 'LOADTEST',
  });

export type Outcome = { ok: boolean; kind: string; ms: number };

export function classify(err: unknown): string {
  if (err instanceof StockShortageError) return 'rupture (409 attendu)';
  const msg = err instanceof Error ? err.message : String(err);
  if (/deadlock/i.test(msg)) return 'DEADLOCK';
  if (/Unique constraint|P2002/i.test(msg)) return 'conflit numéro du jour';
  if (/could not serialize|40001/i.test(msg)) return 'serialization';
  if (err instanceof OrderMutationError)
    return `refus métier ${err.httpStatus}: ${msg.slice(0, 50)}`;
  return `ERREUR: ${msg.split('\n').pop()!.slice(0, 90)}`;
}

/** Lance toutes les tâches « en même temps » (barrière de départ commune). */
export async function burst(
  tasks: (() => Promise<unknown>)[]
): Promise<{ results: Outcome[]; values: unknown[]; wallMs: number }> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const values: unknown[] = [];
  const settled = tasks.map(async (task, i) => {
    await gate;
    const t0 = performance.now();
    try {
      values[i] = await task();
      return { ok: true, kind: 'ok', ms: performance.now() - t0 } as Outcome;
    } catch (e) {
      return {
        ok: false,
        kind: classify(e),
        ms: performance.now() - t0,
      } as Outcome;
    }
  });
  const start = performance.now();
  release();
  const results = await Promise.all(settled);
  return { results, values, wallMs: performance.now() - start };
}

export function tally(results: Outcome[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const r of results) t[r.kind] = (t[r.kind] ?? 0) + 1;
  return t;
}

export const stockOf = async (id: string) =>
  (
    await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stockQuantity: true },
    })
  ).stockQuantity;
export const optStock = async (id: string) =>
  (
    await prisma.supplementOption.findUniqueOrThrow({
      where: { id },
      select: { stockQuantity: true },
    })
  ).stockQuantity;

/** Ce que l'audit du dépôt voit sur les commandes LOADTEST + dérive du journal. */
export async function auditSummary() {
  const [drift, ledger] = await Promise.all([
    runStockAudit(),
    loadOrderLedger({ onlyIssues: false, limit: 300 }, 'audit'),
  ]);
  return {
    drifts: drift.drifts.length,
    negatives: drift.negatives.length,
    defects: ledger.defects,
    examined: ledger.examined,
  };
}

export type Row = {
  scenario: string;
  concurrency: number;
  wallMs: number;
  verdict: 'OK' | 'ÉCHEC';
  details: string[];
};
export const rows: Row[] = [];
export function report(row: Row) {
  rows.push(row);
  const icon = row.verdict === 'OK' ? '✅' : '❌';
  console.log(
    `\n${icon} ${row.scenario}  (${row.concurrency} en parallèle, ${row.wallMs.toFixed(0)} ms)`
  );
  for (const d of row.details) console.log('   ' + d);
}
