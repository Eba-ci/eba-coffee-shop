import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: queryRaw } }));

import { listCustomers } from './list';

const sqlOf = (call: unknown[]) => (call[0] as { sql: string }).sql;
const valuesOf = (call: unknown[]) => (call[0] as { values: unknown[] }).values;

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw
    .mockResolvedValueOnce([
      { id: 'a', ordersCount: 3, totalSpent: 9000, lastOrderAt: null },
      { id: 'b', ordersCount: 0, totalSpent: 0, lastOrderAt: null },
    ])
    .mockResolvedValueOnce([{ total: 42 }]);
});

describe('listCustomers', () => {
  it('2 requêtes quelle que soit la taille de la page : les lignes et le total', async () => {
    const res = await listCustomers({ search: 'kou', page: 2 });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ total: 42, pageSize: 20 });
    // OFFSET de la page 2.
    expect(valuesOf(queryRaw.mock.calls[0])).toContain(20);
  });

  it('withStats : les chiffres viennent de la MÊME requête, calculés APRÈS le LIMIT de la page', async () => {
    const { customers } = await listCustomers({}, { withStats: true });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const sql = sqlOf(queryRaw.mock.calls[0]);
    expect(sql).toContain('LATERAL');
    expect(sql).toContain('"ordersCount"');
    // La jointure lateral est hors de la sous-requête qui porte le LIMIT : les
    // agrégats ne sont pas calculés pour tous les clients.
    expect(sql.indexOf('LIMIT')).toBeLessThan(sql.indexOf('LATERAL'));
    expect(customers[0].stats).toEqual({
      ordersCount: 3,
      totalSpent: 9000,
      lastOrderAt: null,
    });
    // Les colonnes de stats ne fuient pas dans la fiche.
    expect(customers[0]).not.toHaveProperty('ordersCount');
  });

  it('sans withStats : aucune jointure sur les commandes, stats nulles', async () => {
    const { customers } = await listCustomers({ search: 'kou' });
    expect(sqlOf(queryRaw.mock.calls[0])).not.toContain('"order"');
    expect(customers[0].stats).toBeNull();
  });

  it('un tri sur une stat classe tous les clients (agrégats groupés), un autre tri non', async () => {
    await listCustomers({ sort: 'totalSpent' });
    expect(sqlOf(queryRaw.mock.calls[0])).toContain('GROUP BY');
    queryRaw.mockClear().mockResolvedValue([]);
    await listCustomers({ sort: 'name' }, { withStats: true });
    expect(sqlOf(queryRaw.mock.calls[0])).not.toContain('GROUP BY');
  });

  it('le total ne dépend ni du tri ni de la jointure', async () => {
    await listCustomers({ sort: 'totalSpent' }, { withStats: true });
    expect(sqlOf(queryRaw.mock.calls[1])).not.toContain('"order"');
  });

  describe('vues rapides (Meilleurs / Plus fidèles / Réguliers)', () => {
    it('une vue joint les agrégats de tous les clients et ne garde que ceux qui ont commandé', async () => {
      await listCustomers({ view: 'meilleurs' }, { withStats: true });
      const sql = sqlOf(queryRaw.mock.calls[0]);
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('COALESCE(s.orders, 0) > 0');
      // Le total passe par la même jointure : sans elle il compterait les clients sans commande.
      expect(sqlOf(queryRaw.mock.calls[1])).toContain('GROUP BY');
    });

    it('chaque vue a son tri par défaut, un tri explicite l’emporte', async () => {
      await listCustomers({ view: 'meilleurs' });
      expect(sqlOf(queryRaw.mock.calls[0])).toContain(
        'ORDER BY (COALESCE(s.gross, 0) - COALESCE(rf.refunded, 0)) DESC'
      );
      queryRaw.mockClear().mockResolvedValue([]);
      await listCustomers({ view: 'fideles' });
      expect(sqlOf(queryRaw.mock.calls[0])).toContain(
        'ORDER BY COALESCE(s.orders, 0) DESC'
      );
      queryRaw.mockClear().mockResolvedValue([]);
      await listCustomers({ view: 'fideles', sort: 'name' });
      expect(sqlOf(queryRaw.mock.calls[0])).toContain('ORDER BY c.name');
    });

    it('« Réguliers » exige un minimum de jours distincts avec commande', async () => {
      await listCustomers({ view: 'reguliers' });
      const call = queryRaw.mock.calls[0];
      expect(sqlOf(call)).toContain('COALESCE(s.days, 0) >=');
      expect(sqlOf(call)).toContain('COUNT(DISTINCT');
      expect(valuesOf(call)).toContain(3);
    });

    it('la période borne commandes et remboursements, dans la jointure ET dans les chiffres de la page', async () => {
      const since = new Date('2026-10-29T00:00:00Z');
      await listCustomers({ view: 'meilleurs', since }, { withStats: true });
      const call = queryRaw.mock.calls[0];
      expect(sqlOf(call)).toContain('o."createdAt" >=');
      expect(sqlOf(call)).toContain('ro."createdAt" >=');
      // 2 bornes dans la jointure (commandes + remboursements) et 2 dans le lateral.
      expect(valuesOf(call).filter((v) => v === since)).toHaveLength(4);
    });

    it('sans vue : le total n’est pas joint aux commandes et aucune borne n’est ajoutée', async () => {
      await listCustomers({ since: new Date() });
      expect(sqlOf(queryRaw.mock.calls[0])).not.toContain('"order"');
      expect(sqlOf(queryRaw.mock.calls[1])).not.toContain('"order"');
    });
  });
});
