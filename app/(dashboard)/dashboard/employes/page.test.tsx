// Garde de la page Employés (#440) : un non-ADMIN/COMPTABLE est refusé et
// aucune lecture n'est déclenchée (donc aucune donnée salariale en réponse).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requirePayroll: vi.fn() }));
vi.mock('@/lib/employees/queries', () => ({
  listEmployeesOverview: vi.fn(),
}));
vi.mock('./_components/employees-list', () => ({
  EmployeesList: () => null,
}));

import { requirePayroll } from '@/lib/auth-helpers';
import { listEmployeesOverview } from '@/lib/employees/queries';
import EmployesPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('page Employés : garde', () => {
  it('refuse un MANAGER sans appeler la lecture', async () => {
    vi.mocked(requirePayroll).mockRejectedValue(new Error('Non autorisé'));
    await expect(EmployesPage()).rejects.toThrow('Non autorisé');
    expect(listEmployeesOverview).not.toHaveBeenCalled();
  });

  it('charge la liste pour un COMPTABLE', async () => {
    vi.mocked(requirePayroll).mockResolvedValue({
      user: { id: 'u1', role: 'COMPTABLE' },
    } as never);
    vi.mocked(listEmployeesOverview).mockResolvedValue({
      month: '2026-11',
      employees: [],
    });
    await expect(EmployesPage()).resolves.toBeTruthy();
    expect(listEmployeesOverview).toHaveBeenCalledTimes(1);
  });
});
