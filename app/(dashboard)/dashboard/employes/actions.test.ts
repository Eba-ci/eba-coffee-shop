// Garde et messages des écritures Employés (#441). La garde ADMIN est
// évaluée côté serveur dans chaque action, AVANT toute mutation : un COMPTABLE
// reçoit un refus lisible et rien n'est écrit.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/salaries/mutations', () => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
}));
vi.mock('@/lib/salaries/rate-mutations', () => ({ addSalaryRate: vi.fn() }));

import {
  SALARY_END_AFTER_START_MESSAGE,
  SALARY_RATE_DUPLICATE_MESSAGE,
} from '@/config/constants';
import { requireAdmin } from '@/lib/auth-helpers';
import * as salaries from '@/lib/salaries/mutations';
import * as rates from '@/lib/salaries/rate-mutations';
import {
  addSalaryRateAction,
  createEmployeeAction,
  reactivateEmployeeAction,
  recordEmployeeExitAction,
  updateEmployeeIdentityAction,
} from './actions';

const admin = { user: { id: 'u1', role: 'ADMIN' } } as never;

const rate = {
  employeeId: 'e1',
  monthlyAmount: 150_000,
  startDate: '2026-11-01',
};

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
    'updateEmployeeIdentityAction',
    () => updateEmployeeIdentityAction('e1', { name: 'B' }),
    { fn: salaries.updateEmployee, args: ['e1', { name: 'B' }] },
  ],
  [
    'recordEmployeeExitAction',
    () => recordEmployeeExitAction('e1', { endDate: '2026-11-30' }),
    {
      fn: salaries.updateEmployee,
      args: ['e1', { endDate: '2026-11-30', active: false }],
    },
  ],
  [
    'addSalaryRateAction',
    () => addSalaryRateAction(rate),
    { fn: rates.addSalaryRate, args: [rate] },
  ],
  [
    'reactivateEmployeeAction',
    () => reactivateEmployeeAction('e1'),
    {
      fn: salaries.updateEmployee,
      args: ['e1', { active: true, endDate: null }],
    },
  ],
];

describe('écritures Employés : garde ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
  });

  it.each(cases)(
    '%s refuse un COMPTABLE et n’exécute aucune mutation',
    async (_n, call, c) => {
      await expect(call()).resolves.toEqual({
        ok: false,
        error: 'Non autorisé',
      });
      expect(c.fn).not.toHaveBeenCalled();
    }
  );
});

describe('écritures Employés : ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(admin);
  });

  it.each(cases)('%s atteint la mutation lib', async (_n, call, c) => {
    await expect(call()).resolves.toEqual({ ok: true });
    expect(c.fn).toHaveBeenCalledWith(...c.args);
  });

  it('refuse une date de sortie vide sans écrire', async () => {
    await expect(
      recordEmployeeExitAction('e1', { endDate: '' })
    ).resolves.toEqual({ ok: false, error: 'Date de sortie requise' });
    expect(salaries.updateEmployee).not.toHaveBeenCalled();
  });

  it('remonte la cohérence entrée/sortie de la mutation', async () => {
    vi.mocked(salaries.updateEmployee).mockRejectedValue(
      new Error(SALARY_END_AFTER_START_MESSAGE)
    );
    await expect(
      recordEmployeeExitAction('e1', { endDate: '2026-01-01' })
    ).resolves.toEqual({
      ok: false,
      error: SALARY_END_AFTER_START_MESSAGE,
    });
  });

  it('refuse un taux négatif sans écrire', async () => {
    await expect(
      addSalaryRateAction({ ...rate, monthlyAmount: -1_000 })
    ).resolves.toEqual({
      ok: false,
      error: 'Le taux doit être un montant positif',
    });
    expect(rates.addSalaryRate).not.toHaveBeenCalled();
  });

  it('refuse un taux sans date sans écrire', async () => {
    await expect(
      addSalaryRateAction({ ...rate, startDate: '' })
    ).resolves.toEqual({ ok: false, error: 'Date d’effet requise' });
    expect(rates.addSalaryRate).not.toHaveBeenCalled();
  });

  it('refuse proprement une date de taux déjà utilisée', async () => {
    vi.mocked(rates.addSalaryRate).mockRejectedValue(
      new Error(SALARY_RATE_DUPLICATE_MESSAGE)
    );
    await expect(addSalaryRateAction(rate)).resolves.toEqual({
      ok: false,
      error: SALARY_RATE_DUPLICATE_MESSAGE,
    });
  });
});
