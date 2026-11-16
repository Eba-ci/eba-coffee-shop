import { beforeEach, describe, expect, it, vi } from 'vitest';

const { links, history, queries } = vi.hoisted(() => ({
  links: { linkExpenses: vi.fn(), unlinkExpenses: vi.fn() },
  history: { getFixedCostHistory: vi.fn() },
  queries: { getLinkProposals: vi.fn(), listUnlinkedFixedExpenses: vi.fn() },
}));
vi.mock('@/lib/fixed-costs/links-mutations', async (orig) => ({
  ...(await orig<typeof import('@/lib/fixed-costs/links-mutations')>()),
  ...links,
}));
vi.mock('@/lib/fixed-costs/history-queries', () => history);
vi.mock('@/lib/fixed-costs/links-queries', () => queries);

import { handleRpc } from '../handler';
import { FINANCE_TOOL_NAMES, READ_ONLY_TOOL_NAMES, tools } from './registry';

const NEW_TOOLS = [
  'detect_fixed_cost_history',
  'list_unlinked_fixed_expenses',
  'propose_fixed_cost_links',
  'link_expense_to_occurrence',
  'unlink_expense',
];
const WRITES = ['link_expense_to_occurrence', 'unlink_expense'];

const call = (
  name: string,
  args: Record<string, unknown>,
  allowedTools?: Set<string>
) =>
  handleRpc(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    },
    { allowedTools }
  );

const target = { expenseId: 'e1', costId: 'c1', dueDate: '2026-03-10' };

describe('outils MCP — rapprochement des charges fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    links.linkExpenses.mockResolvedValue([{ result: 'linked' }]);
    links.unlinkExpenses.mockResolvedValue([{ result: 'unlinked' }]);
  });

  it('sont enregistrés, scope finance, écritures marquées non lecture seule', () => {
    for (const name of NEW_TOOLS) {
      const t = tools.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(t!.scope).toBe('finance');
      expect(FINANCE_TOOL_NAMES.has(name)).toBe(true);
      expect(t!.readOnly).toBe(!WRITES.includes(name));
    }
  });

  it('l’ANALYSTE lit mais ne peut écrire (tools/call refusé)', async () => {
    for (const name of WRITES) {
      expect(READ_ONLY_TOOL_NAMES.has(name)).toBe(false);
      const res = await call(name, target, READ_ONLY_TOOL_NAMES);
      expect((res!.result as { isError: boolean }).isError).toBe(true);
    }
    expect(links.linkExpenses).not.toHaveBeenCalled();
    expect(links.unlinkExpenses).not.toHaveBeenCalled();
    for (const name of NEW_TOOLS.filter((n) => !WRITES.includes(n)))
      expect(READ_ONLY_TOOL_NAMES.has(name)).toBe(true);
  });

  it('link_expense_to_occurrence : simulation par défaut, exécute avec confirmer', async () => {
    await call('link_expense_to_occurrence', target);
    expect(links.linkExpenses.mock.calls[0][2]).toEqual({ dryRun: true });
    await call('link_expense_to_occurrence', { ...target, confirmer: true });
    expect(links.linkExpenses.mock.calls[1][2]).toEqual({ dryRun: false });
    expect(links.linkExpenses.mock.calls[1][1]).toMatchObject({
      source: 'MCP',
    });
  });

  it('unlink_expense : simulation par défaut, exécute avec confirmer', async () => {
    await call('unlink_expense', { expenseId: 'e1' });
    expect(links.unlinkExpenses.mock.calls[0][2]).toEqual({ dryRun: true });
    await call('unlink_expense', { expenseId: 'e1', confirmer: true });
    expect(links.unlinkExpenses.mock.calls[1][2]).toEqual({ dryRun: false });
  });

  it('une dépense de salaire est refusée avec un message explicite', async () => {
    links.linkExpenses.mockRejectedValue(
      new Error(
        'Une dépense de salaire ne peut pas être rattachée à une charge fixe.'
      )
    );
    const res = await call('link_expense_to_occurrence', target);
    const r = res!.result as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/salaire/);
  });

  it('détection : mêmes données que l’écran (getFixedCostHistory)', async () => {
    history.getFixedCostHistory.mockResolvedValue([{ categoryId: 'a' }]);
    await call('detect_fixed_cost_history', { referenceMonth: '2026-11' });
    expect(history.getFixedCostHistory).toHaveBeenCalledWith('2026-11');
  });

  it('refuse des identifiants ou dates invalides (Zod strict)', async () => {
    const res = await call('link_expense_to_occurrence', {
      ...target,
      dueDate: '10/03/2026',
    });
    expect((res!.result as { isError: boolean }).isError).toBe(true);
    expect(links.linkExpenses).not.toHaveBeenCalled();
  });
});
