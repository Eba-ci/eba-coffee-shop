// Garde de la fiche employé 360° (#440) : refus avant toute lecture.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/lib/auth-helpers', () => ({ requirePayroll: vi.fn() }));
vi.mock('@/lib/employees/queries', () => ({ getEmployee360: vi.fn() }));
vi.mock('./_components/employee-detail', () => ({
  EmployeeDetail: () => null,
}));

import { requirePayroll } from '@/lib/auth-helpers';
import { getEmployee360 } from '@/lib/employees/queries';
import EmployeDetailPage from './page';

const params = { params: Promise.resolve({ employeeId: 'e1' }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fiche Employé : garde', () => {
  it('refuse un ANALYSTE sans appeler la lecture', async () => {
    vi.mocked(requirePayroll).mockRejectedValue(new Error('Non autorisé'));
    await expect(EmployeDetailPage(params)).rejects.toThrow('Non autorisé');
    expect(getEmployee360).not.toHaveBeenCalled();
  });

  it('refuse un employé inconnu via notFound', async () => {
    vi.mocked(requirePayroll).mockResolvedValue({
      user: { id: 'u1', role: 'ADMIN' },
    } as never);
    vi.mocked(getEmployee360).mockResolvedValue(null);
    await expect(EmployeDetailPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
