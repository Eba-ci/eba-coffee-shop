import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/salaries/mutations', () => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  setSalaryRate: vi.fn(),
  recordSalaryPayment: vi.fn(),
}));
vi.mock('@/lib/salaries/advance-mutations', () => ({
  updateAdvanceRecovery: vi.fn(),
  adjustSalaryAdvance: vi.fn(),
  cancelSalaryAdvance: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import * as advances from '@/lib/salaries/advance-mutations';
import * as salaries from '@/lib/salaries/mutations';
import {
  adjustSalaryAdvanceAction,
  cancelSalaryAdvanceAction,
  createEmployeeAction,
  recordSalaryPaymentAction,
  setSalaryRateAction,
  updateAdvanceRecoveryAction,
  updateEmployeeAction,
} from './actions';

const admin = { user: { id: 'u1', role: 'ADMIN' } } as never;

// Chaque action de l'écran : son déclencheur et la mutation lib qu'elle doit
// atteindre (jamais rappelée pour un non-admin).
const cases: [
  string,
  () => Promise<unknown>,
  { fn: unknown; args: unknown[] },
][] = [
  [
    'createEmployeeAction',
    () => createEmployeeAction({ name: 'A' }),
    { fn: salaries.createEmployee, args: [{ name: 'A' }] },
  ],
  [
    'updateEmployeeAction',
    () => updateEmployeeAction('e1', { name: 'B' }),
    { fn: salaries.updateEmployee, args: ['e1', { name: 'B' }] },
  ],
  [
    'setSalaryRateAction',
    () => setSalaryRateAction({ employeeId: 'e1' }),
    { fn: salaries.setSalaryRate, args: [{ employeeId: 'e1' }] },
  ],
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
];

describe('actions Salaires : garde ADMIN par action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
  });

  it.each(cases)(
    '%s refuse un non-admin et n’exécute rien',
    async (_n, call, c) => {
      await expect(call()).rejects.toThrow('Non autorisé');
      expect(c.fn).not.toHaveBeenCalled();
    }
  );
});

describe('actions Salaires : admin', () => {
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
