import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/generated/prisma/client';
import { assistantTools } from '@/lib/ai/assistant/tools';
import { tools } from './registry';

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'];

// Le détail des salaires (nom d'employé, montant individuel, effectif) ne doit
// JAMAIS avoir de surface MCP ni d'outil d'assistant, pour quelque rôle que ce
// soit. Seuls existent l'agrégat mensuel « Salaires du mois » (un nombre) et la
// ligne unique « Salaires » du point mort. Ce test garde cette frontière : le
// jour où un outil « salaires » apparaît, il échoue et force la revue des rôles.
const SALARY_DETAIL_RE = /salaire|salary|employ|paie|payroll|rémunér/i;

describe('confidentialité des salaires (MCP + assistant)', () => {
  it('aucun outil MCP n’expose le détail des salaires', () => {
    const exposed = tools.filter(
      (t) => SALARY_DETAIL_RE.test(t.name) || SALARY_DETAIL_RE.test(t.title)
    );
    expect(exposed.map((t) => t.name)).toEqual([]);
  });

  it('aucun outil d’assistant n’expose le détail des salaires, quel que soit le rôle', () => {
    for (const role of ROLES) {
      const exposed = assistantTools(role).filter((t) =>
        SALARY_DETAIL_RE.test(t.name)
      );
      expect(exposed.map((t) => t.name)).toEqual([]);
    }
  });

  it('le point mort n’a qu’un agrégat, sans détail nominatif annoncé', () => {
    const breakEven = tools.find((t) => t.name === 'get_break_even');
    expect(breakEven).toBeDefined();
    expect(SALARY_DETAIL_RE.test(breakEven!.description)).toBe(false);
  });
});
