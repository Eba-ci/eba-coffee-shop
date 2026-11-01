// lib/mcp/tools.test.ts
//
// Filet de sécurité pour la taxonomie `toolset` (cf. `TOOLSET_NAMES`) : garantit
// que tout outil du registre est classé, et que `TOOLSET_TOOL_NAMES` partitionne
// bien l'ensemble des outils (aucun trou, aucun chevauchement). Redondant avec
// le champ `toolset` obligatoire côté TypeScript, mais couvre aussi une
// éventuelle désynchronisation manuelle entre `tools` et `TOOLSET_TOOL_NAMES`.
import { describe, it, expect } from 'vitest';
import { tools, toolsByName, TOOLSET_NAMES, TOOLSET_TOOL_NAMES } from './tools';

describe('toolset — partition complète des outils', () => {
  it('chaque outil a un toolset valide', () => {
    for (const t of tools) {
      expect(TOOLSET_NAMES).toContain(t.toolset);
    }
  });

  it('TOOLSET_TOOL_NAMES partitionne tous les outils sans trou ni chevauchement', () => {
    const seen = new Set<string>();
    for (const toolset of TOOLSET_NAMES) {
      for (const name of TOOLSET_TOOL_NAMES[toolset]) {
        expect(seen.has(name)).toBe(false);
        seen.add(name);
      }
    }
    expect(seen.size).toBe(tools.length);
  });
});

describe('registre — intégrité', () => {
  it("les noms d'outils sont uniques", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(toolsByName.size).toBe(tools.length);
  });

  // Garde-fou contre un module oublié dans `registry.ts` : à mettre à jour
  // volontairement quand on ajoute ou retire un outil.
  it("expose le nombre attendu d'outils", () => {
    expect(tools).toHaveLength(157);
  });
});

// ─── Commandes différées : surface MCP ───────────────────────────────────────

describe('create_order — créneau de retrait', () => {
  const createOrder = tools.find((t) => t.name === 'create_order')!;

  it('accepte un pickupTime ISO (une commande différée est créable par MCP)', () => {
    const parsed = createOrder.inputSchema.safeParse({
      items: [{ productId: 'p1', quantity: 1 }],
      pickupTime: '2026-06-15T11:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('reste optionnel — le walk-in MCP ne change pas', () => {
    const parsed = createOrder.inputSchema.safeParse({
      items: [{ productId: 'p1', quantity: 1 }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('get_pending_demand — restriction à un jour', () => {
  const tool = tools.find((t) => t.name === 'get_pending_demand')!;

  it('accepte un jour civil, et reste utilisable sans argument', () => {
    expect(tool.inputSchema.safeParse({ day: '2026-06-15' }).success).toBe(
      true
    );
    expect(tool.inputSchema.safeParse({}).success).toBe(true);
  });

  it('refuse un format de date non civil', () => {
    expect(
      tool.inputSchema.safeParse({ day: '2026-06-15T11:00:00Z' }).success
    ).toBe(false);
  });
});
