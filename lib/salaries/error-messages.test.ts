import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: {
    employee: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    salaryPayment: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  SALARY_ADVANCE_BELOW_RECOVERED_MESSAGE,
  SALARY_ADVANCE_ONLY_MESSAGE,
  SALARY_END_AFTER_START_MESSAGE,
} from '@/config/constants';
import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { adjustSalaryAdvance } from './advance-mutations';
import { SalaryIdempotencyConflictError } from './errors';
import { recordSalaryPayment, updateEmployee } from './mutations';

// Nom et montant « pièges » : aucun message d'erreur de lib/salaries ne doit
// les contenir (ni nom d'employé, ni montant individuel). Une erreur porte le
// message brut jusqu'à `event.message` / `exception.values[].value` de Sentry.
const NAME = 'Awa Traoré';
const AMOUNT = 123456;

function runTx(tx: Record<string, unknown>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (t: unknown) => unknown
  ) => fn(tx)) as never);
}

function expectNoPii(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  expect(message).not.toContain('Awa');
  expect(message).not.toContain('Traoré');
  expect(message).not.toContain(NAME);
  expect(message).not.toContain(String(AMOUNT));
  return message;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin', role: 'ADMIN' },
  } as never);
});

describe('messages d’erreur salaires — jamais de nom ni de montant', () => {
  it('sortie antérieure à l’entrée (updateEmployee)', async () => {
    runTx({
      employee: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          startDate: new Date(Date.UTC(2021, 0, 1)),
          endDate: null,
        }),
      },
    });
    const err = await updateEmployee('e1', {
      name: NAME,
      endDate: '2020-01-01',
    }).catch((e) => e);
    expect(expectNoPii(err)).toBe(SALARY_END_AFTER_START_MESSAGE);
  });

  it('opération d’avance visant un salaire', async () => {
    runTx({
      salaryPayment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'p1',
          type: 'SALAIRE',
          amount: AMOUNT,
          note: NAME,
          month: '2026-01',
          recoveryMonths: 1,
        }),
      },
    });
    const err = await adjustSalaryAdvance(
      { paymentId: 'p1', amount: AMOUNT },
      '2026-06-01'
    ).catch((e) => e);
    expect(expectNoPii(err)).toBe(SALARY_ADVANCE_ONLY_MESSAGE);
  });

  it('avance réduite sous ce qui a déjà été récupéré', async () => {
    runTx({
      salaryPayment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'p1',
          type: 'AVANCE',
          amount: AMOUNT,
          note: NAME,
          month: '2026-01',
          recoveryMonths: 1,
        }),
        update: vi.fn(),
      },
    });
    const err = await adjustSalaryAdvance(
      { paymentId: 'p1', amount: 10 },
      '2026-06-01'
    ).catch((e) => e);
    expect(expectNoPii(err)).toBe(SALARY_ADVANCE_BELOW_RECOVERED_MESSAGE);
  });

  it('conflit d’idempotence d’un versement', async () => {
    vi.mocked(prisma.salaryPayment.findUnique).mockResolvedValue({
      employeeId: 'e1',
      date: new Date(Date.UTC(2026, 5, 30)),
      month: '2026-06',
      amount: AMOUNT,
      type: 'SALAIRE',
    } as never);
    const err = await recordSalaryPayment({
      employeeId: 'e1',
      date: '2026-06-30',
      month: '2026-06',
      amount: AMOUNT - 1,
      type: 'SALAIRE',
      idempotencyKey: 'k1',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SalaryIdempotencyConflictError);
    expectNoPii(err);
  });
});
