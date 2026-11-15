// Outils d'écriture de paie : simulation par défaut, exécution sur confirmer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/salaries/payroll-mutations', () => ({
  settlePayroll: vi.fn().mockResolvedValue({ created: 2 }),
}));

import { settlePayroll } from '@/lib/salaries/payroll-mutations';
import { salariesWriteTools } from './salaries-write';

const tool = salariesWriteTools.find((t) => t.name === 'pay_salary_payroll')!;
const input = {
  month: '2026-10',
  date: '2026-11-01',
  idempotencyKey: 'paie-mcp-1',
  items: [{ employeeId: 'e1', amount: 100_000 }],
};

beforeEach(() => vi.clearAllMocks());

describe('outils d’écriture de paie', () => {
  it('sont tous ADMIN seul et non en lecture seule', () => {
    for (const t of salariesWriteTools) {
      expect(t.scope).toBe('admin');
      expect(t.readOnly).toBe(false);
    }
  });

  it('simulent par défaut : rien n’est exécuté', async () => {
    const parsed = tool.inputSchema.parse(input);
    const res = (await tool.handler(parsed)) as { dryRun: boolean };
    expect(res.dryRun).toBe(true);
    expect(settlePayroll).not.toHaveBeenCalled();
  });

  it('exécutent avec confirmer: true', async () => {
    const parsed = tool.inputSchema.parse({ ...input, confirmer: true });
    await expect(tool.handler(parsed)).resolves.toEqual({ created: 2 });
    expect(settlePayroll).toHaveBeenCalledTimes(1);
  });
});
