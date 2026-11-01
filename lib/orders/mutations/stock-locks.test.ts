import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { lockStockForOrder } from './stock-locks';
import { lockStockKeys, lockStockRows } from '@/lib/stock-history/lock';

const item = (productId: string, supplements: unknown[] = []) =>
  ({ productId, productName: productId, quantity: 1, supplements }) as CartItem;

/** Transaction factice qui note, dans l'ordre, chaque requête de verrou envoyée. */
function makeTx(
  opts: {
    optionIdByName?: Record<string, string>;
    holds?: [string, string, number][];
  } = {}
) {
  const sql: { text: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        // `Prisma.join(ids)` arrive comme un objet SQL : on en aplatit les valeurs.
        const flat = values.flatMap((v) =>
          v && typeof v === 'object' && 'values' in v
            ? (v as { values: unknown[] }).values
            : [v]
        );
        sql.push({ text: strings.join('?'), values: flat });
        return [];
      }
    ),
    supplementOption: {
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => {
        const id = opts.optionIdByName?.[where.name];
        return id ? { id } : null;
      }),
    },
    orderStockHold: {
      findMany: vi.fn(async () =>
        (opts.holds ?? []).map(([kind, resourceId, quantity]) => ({
          kind,
          resourceId,
          quantity,
        }))
      ),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, sql };
}

describe('lockStockRows — une requête par type, produits d’abord', () => {
  it('verrouille les produits puis les options, avec ORDER BY id FOR UPDATE', async () => {
    const { tx, sql } = makeTx();
    await lockStockRows(tx, { productIds: ['p2', 'p1'], optionIds: ['o1'] });
    expect(sql).toHaveLength(2);
    expect(sql[0].text).toContain('"product"');
    expect(sql[1].text).toContain('"supplement_option"');
    for (const q of sql) {
      expect(q.text).toContain('ORDER BY "id" FOR UPDATE');
    }
  });

  it('dédoublonne et n’envoie rien quand il n’y a rien à verrouiller', async () => {
    const { tx, sql } = makeTx();
    await lockStockRows(tx, { productIds: ['p1', 'p1', 'p1'] });
    expect(sql).toHaveLength(1);
    expect(sql[0].values).toEqual(['p1']);
    sql.length = 0;
    await lockStockRows(tx, {});
    expect(sql).toHaveLength(0);
  });

  it('lockStockKeys répartit les clés PRODUCT: / OPTION:', async () => {
    const { tx, sql } = makeTx();
    await lockStockKeys(tx, ['OPTION:o9', 'PRODUCT:p3']);
    expect(sql.map((q) => q.values)).toEqual([['p3'], ['o9']]);
  });
});

describe('lockStockForOrder — ordre indépendant du panier', () => {
  it('deux paniers dans un ordre différent verrouillent exactement les mêmes lignes', async () => {
    const ab = makeTx();
    const ba = makeTx();
    await lockStockForOrder(ab.tx, undefined, [[item('A'), item('B')]]);
    await lockStockForOrder(ba.tx, undefined, [[item('B'), item('A')]]);
    // Mêmes valeurs, mêmes requêtes : l'ordre d'acquisition est celui de Postgres
    // (ORDER BY id), pas celui du panier.
    expect(new Set(ab.sql[0].values)).toEqual(new Set(ba.sql[0].values));
    expect(ab.sql.map((q) => q.text)).toEqual(ba.sql.map((q) => q.text));
  });

  it('une édition verrouille l’union de l’ancien et du nouveau contenu, et les réservations', async () => {
    const { tx, sql } = makeTx({ holds: [['PRODUCT', 'P-held', 2]] });
    await lockStockForOrder(tx, 'order1', [[item('A')], [item('B')]]);
    expect(sql).toHaveLength(1);
    expect(new Set(sql[0].values)).toEqual(new Set(['A', 'B', 'P-held']));
  });

  it('les goûts sont résolus puis verrouillés avec leur produit', async () => {
    const { tx, sql } = makeTx({ optionIdByName: { Chocolat: 'o-choc' } });
    await lockStockForOrder(tx, undefined, [
      [
        item('A', [
          { groupName: 'Goûts', optionName: 'Chocolat', quantity: 1 },
        ]),
      ],
    ]);
    expect(sql.map((q) => q.values)).toEqual([['A'], ['o-choc']]);
  });
});
