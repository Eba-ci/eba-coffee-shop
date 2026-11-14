// Garde des écritures de paie du module Employés (#450) : versements, avances,
// primes et retenues. La garde ADMIN est évaluée côté serveur, avant toute
// mutation : un COMPTABLE (qui consulte la Paie du mois) ne peut rien écrire.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/salaries/mutations', () => ({
  recordSalaryPayment: vi.fn(),
}));
vi.mock('@/lib/salaries/advance-mutations', () => ({
  updateAdvanceRecovery: vi.fn(),
  adjustSalaryAdvance: vi.fn(),
  cancelSalaryAdvance: vi.fn(),
}));
vi.mock('@/lib/salaries/adjustment-mutations', () => ({
  createSalaryAdjustment: vi.fn(),
  cancelSalaryAdjustment: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import * as adjustments from '@/lib/salaries/adjustment-mutations';
import * as advances from '@/lib/salaries/advance-mutations';
import * as salaries from '@/lib/salaries/mutations';
import {
  adjustSalaryAdvanceAction,
  cancelSalaryAdvanceAction,
  cancelSalaryAdjustmentAction,
  createSalaryAdjustmentAction,
  recordSalaryPaymentAction,
  updateAdvanceRecoveryAction,
} from './salary-actions';

const admin = { user: { id: 'u1', role: 'ADMIN' } } as never;

const cases: [
  string,
  () => Promise<unknown>,
  { fn: unknown; args: unknown[] },
][] = [
  [
    'recordSalaryPaymentAction',
    () => recordSalaryPaymentAction({ employeeId: 'e1' }),
    { fn: salaries.recordSalaryPayment, args: [{ employeeId: 'e1' }] },
  ],
  [
    'updateAdvanceRecoveryAction',
    () => updateAdvanceRecoveryAction({ paymentId: 'a1' }),
    { fn: advances.updateAdvanceRecovery, args: [{ paymentId: 'a1' }] },
  ],
  [
    'adjustSalaryAdvanceAction',
    () => adjustSalaryAdvanceAction({ paymentId: 'a1' }),
    { fn: advances.adjustSalaryAdvance, args: [{ paymentId: 'a1' }] },
  ],
  [
    'cancelSalaryAdvanceAction',
    () => cancelSalaryAdvanceAction({ paymentId: 'a1' }),
    { fn: advances.cancelSalaryAdvance, args: [{ paymentId: 'a1' }] },
  ],
  [
    'createSalaryAdjustmentAction',
    () => createSalaryAdjustmentAction({ employeeId: 'e1' }),
    { fn: adjustments.createSalaryAdjustment, args: [{ employeeId: 'e1' }] },
  ],
  [
    'cancelSalaryAdjustmentAction',
    () => cancelSalaryAdjustmentAction({ adjustmentId: 'x1' }),
    { fn: adjustments.cancelSalaryAdjustment, args: [{ adjustmentId: 'x1' }] },
  ],
];

describe('écritures de paie : garde ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
  });

  it.each(cases)(
    '%s refuse un COMPTABLE et n’exécute rien',
    async (_n, call, c) => {
      await expect(call()).resolves.toEqual({
        ok: false,
        error: 'Non autorisé',
      });
      expect(c.fn).not.toHaveBeenCalled();
    }
  );
});

describe('écritures de paie : ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(admin);
  });

  it.each(cases)('%s atteint la mutation lib', async (_n, call, c) => {
    await expect(call()).resolves.toEqual({ ok: true });
    expect(c.fn).toHaveBeenCalledWith(...c.args);
  });

  it('renvoie l’erreur métier lisible au lieu de la laisser traverser', async () => {
    vi.mocked(salaries.recordSalaryPayment).mockRejectedValue(
      new Error('Montant invalide')
    );
    await expect(recordSalaryPaymentAction({})).resolves.toEqual({
      ok: false,
      error: 'Montant invalide',
    });
  });
});