// Entrée « Employés » de la sidebar (#440) : visible pour ADMIN et COMPTABLE
// uniquement, et alignée sur la garde serveur `requirePayroll`.

import { describe, expect, it } from 'vitest';
import { PAYROLL_ROLES } from '@/config/constants';
import { navItems } from './nav-items';

describe('nav — Employés', () => {
  const item = navItems.find((i) => i.href === '/dashboard/employes');

  it('existe et pointe vers /dashboard/employes', () => {
    expect(item).toBeDefined();
    expect(item?.label).toBe('Employés');
  });

  it('partage la même liste de rôles que la garde serveur', () => {
    expect(item?.roles).toBe(PAYROLL_ROLES);
  });

  it('n’est visible ni pour MANAGER ni pour ANALYSTE', () => {
    expect(item?.roles).toContain('ADMIN');
    expect(item?.roles).toContain('COMPTABLE');
    expect(item?.roles).not.toContain('MANAGER');
    expect(item?.roles).not.toContain('ANALYSTE');
  });
});
