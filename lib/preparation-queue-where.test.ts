import { describe, it, expect } from 'vitest';
import { buildPreparationWhere } from './preparation-queue-where';

function branches() {
  return (buildPreparationWhere() as { OR: Record<string, unknown>[] }).OR;
}

describe('buildPreparationWhere — file cuisine', () => {
  it('en cuisine / prêtes : visibles tous les jours, sans borne de date', () => {
    const [cooking] = branches();
    expect(cooking).toEqual({ status: { in: ['PREPARING', 'READY'] } });
  });

  it('programmées non lancées : un créneau suffit, passé ou lointain', () => {
    const [, scheduled] = branches();
    const conds = scheduled.AND as Record<string, unknown>[];
    expect(conds).toContainEqual({ status: 'NEW' });
    expect(conds).toContainEqual({ stockReservedAt: null });
    // Pas de borne basse (retard) ni haute (retrait lointain) : juste « a un créneau ».
    expect(conds).toContainEqual({ pickupTime: { not: null } });
  });
});
