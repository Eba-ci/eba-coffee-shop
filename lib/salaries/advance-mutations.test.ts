import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    salaryPayment: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { tx, prismaMock: { $transaction: vi.fn() } };
});

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from '@/lib/auth-helpers';
import {
  adjustSalaryAdvance,
  cancelSalaryAdvance,
  updateAdvanceRecovery,
} from './advance-mutations';

const admin = { user: { id: 'u1', role: 'ADMIN' } } as never;
const advance = {
  id: 'adv1',
  type: 'AVANCE',
  amount: 30_000,
  recoveryMonths: 1,
  month: '2026-06',
  date: '2026-06-30',
  note: null,
  paymentMethod: 'WAVE',
};

describe('mutations d’avance (ADMIN seul, idempotentes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(admin);
    prismaMock.$transaction.mockImplementation((fn: never) => fn(tx as never));
    tx.salaryPayment.findUniqueOrThrow.mockResolvedValue(advance);
    tx.salaryPayment.findUnique.mockResolvedValue(advance);
    tx.salaryPayment.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...advance, ...data })
    );
    tx.salaryPayment.delete.mockResolvedValue(advance);
  });

  it('refuse un appel sans rôle ADMIN, sans toucher la base', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
    await expect(
      updateAdvanceRecovery({ paymentId: 'adv1', recoveryMonths: 3 })
    ).rejects.toThrow('Non autorisé');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('modifie l’étalement d’une avance', async () => {
    await updateAdvanceRecovery({ paymentId: 'adv1', recoveryMonths: 3 });
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'adv1' },
      data: { recoveryMonths: 3 },
    });
  });

  it('reposer le même étalement ne réécrit rien (idempotent)', async () => {
    tx.salaryPayment.findUniqueOrThrow.mockResolvedValue({
      ...advance,
      recoveryMonths: 3,
    });
    const res = await updateAdvanceRecovery({
      paymentId: 'adv1',
      recoveryMonths: 3,
    });
    expect(res).toMatchObject({ recoveryMonths: 3 });
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
  });

  it('ajuste le contenu d’une avance (montant, mois, note)', async () => {
    // Le mois en cours (2026-07) n'est pas compté comme récupéré.
    await adjustSalaryAdvance(
      {
        paymentId: 'adv1',
        amount: 25_000,
        month: '2026-07',
        note: 'corrigé',
      },
      '2026-07-05'
    );
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'adv1' },
      data: { amount: 25_000, month: '2026-07', note: 'corrigé' },
    });
  });

  it('refuse de réduire le montant sous ce qui a déjà été récupéré', async () => {
    // Avance versée en 2026-06, récupérée en une fois en 2026-07 : 30 000 déjà
    // récupérés au 2026-11.
    await expect(
      adjustSalaryAdvance({ paymentId: 'adv1', amount: 5_000 }, '2026-11-11')
    ).rejects.toThrow('récupéré');
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
  });

  it('accepte une réduction restant au-dessus du récupéré', async () => {
    // 30 000 étalés sur 3 mois => 10 000 récupérés en 2026-07 ; au 2026-08 on
    // peut encore ramener le montant à 20 000.
    tx.salaryPayment.findUniqueOrThrow.mockResolvedValue({
      ...advance,
      recoveryMonths: 3,
    });
    await adjustSalaryAdvance(
      { paymentId: 'adv1', amount: 20_000 },
      '2026-08-15'
    );
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'adv1' },
      data: { amount: 20_000 },
    });
  });

  it('refuse d’ajuster un versement qui n’est pas une avance', async () => {
    tx.salaryPayment.findUniqueOrThrow.mockResolvedValue({
      ...advance,
      type: 'SALAIRE',
    });
    await expect(
      adjustSalaryAdvance({ paymentId: 'adv1', amount: 1_000 })
    ).rejects.toThrow('avance');
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
  });

  it('annule une avance, et un rejeu reste un succès (idempotent)', async () => {
    await expect(cancelSalaryAdvance({ paymentId: 'adv1' })).resolves.toEqual({
      id: 'adv1',
      cancelled: true,
    });
    expect(tx.salaryPayment.delete).toHaveBeenCalledWith({
      where: { id: 'adv1' },
    });

    // Rejeu (double clic) : la ligne n'existe plus, on renvoie le même succès.
    tx.salaryPayment.findUnique.mockResolvedValue(null);
    await expect(cancelSalaryAdvance({ paymentId: 'adv1' })).resolves.toEqual({
      id: 'adv1',
      cancelled: true,
    });
    expect(tx.salaryPayment.delete).toHaveBeenCalledTimes(1);
  });

  it('un ajustement sans champ est refusé par le schéma', async () => {
    await expect(adjustSalaryAdvance({ paymentId: 'adv1' })).rejects.toThrow();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
