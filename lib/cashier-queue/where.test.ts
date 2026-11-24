import { describe, it, expect } from 'vitest';
import { buildQueueWhere, OPEN_ORDER_STATUSES } from './where';

const NOW = new Date('2026-11-24T14:00:00Z');

function inner(where: ReturnType<typeof buildQueueWhere>) {
  return where as { status: unknown; OR: Record<string, unknown>[] };
}

describe('buildQueueWhere — file caisse', () => {
  it('exclut les commandes annulées', () => {
    expect(inner(buildQueueWhere(NOW)).status).toEqual({ not: 'CANCELLED' });
  });

  it('une commande ouverte est visible tous les jours, sans aucune borne de date', () => {
    const [open] = inner(buildQueueWhere(NOW)).OR;
    expect(open).toEqual({ status: { in: [...OPEN_ORDER_STATUSES] } });
    expect(open).not.toHaveProperty('createdAt');
    expect(open).not.toHaveProperty('pickupTime');
  });

  it('une commande récupérée mais impayée n’est visible que le jour de sa création (sinon : ardoise)', () => {
    const [, debt] = inner(buildQueueWhere(NOW)).OR;
    expect(debt.status).toBe('COMPLETED');
    expect(debt.isPaid).toBe(false);
    const created = debt.createdAt as { gte: Date; lte: Date };
    expect(created.gte.toISOString()).toBe('2026-11-24T00:00:00.000Z');
    expect(created.lte.getTime()).toBeGreaterThan(NOW.getTime());
    expect(created.lte.toISOString().slice(0, 10)).toBe('2026-11-24');
  });
});
