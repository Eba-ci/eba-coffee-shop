import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/generated/prisma/client';
import { assistantTools } from '@/lib/ai/assistant/tools';
import {
  ADMIN_ONLY_TOOL_NAMES,
  FINANCE_TOOL_NAMES,
  NON_ADMIN_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
  tools,
} from './registry';

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'];

// Le DÉTAIL des salaires (nom d'employé, taux, montant individuel, versements,
// avances) ne doit JAMAIS sortir de l'ADMIN, par aucune surface MCP ni aucun
// outil d'assistant. Seul l'agrégat mensuel « Salaires du mois » — un nombre —
// reste ouvert aux rôles finance. Ce test garde cette frontière : tout nouvel
// outil dont le NOM évoque les salaires doit être `scope: 'admin'`, sauf
// `get_salary_month_total` (finance, agrégat seul).
const SALARY_TOOL_NAME_RE = /salary|salaire/i;
const TOTAL_TOOL = 'get_salary_month_total';

const salaryTools = tools.filter((t) => SALARY_TOOL_NAME_RE.test(t.name));
const salaryDetailTools = salaryTools.filter((t) => t.name !== TOTAL_TOOL);

const names = (set: Set<string>) => [...set];

describe('confidentialité des salaires (MCP + assistant)', () => {
  it('tout outil de détail salaires est classé `scope: admin`', () => {
    expect(salaryDetailTools.length).toBeGreaterThan(0);
    for (const t of salaryDetailTools) expect(t.scope).toBe('admin');
  });

  it('le total seul est ouvert aux rôles finance, en lecture seule', () => {
    const total = tools.find((t) => t.name === TOTAL_TOOL);
    expect(total).toBeDefined();
    expect(total!.scope).toBe('finance');
    expect(total!.readOnly).toBe(true);
  });

  it('MANAGER n’obtient aucun outil de détail salaires', () => {
    for (const t of salaryDetailTools) {
      expect(NON_ADMIN_TOOL_NAMES.has(t.name)).toBe(false);
    }
  });

  it('COMPTABLE n’obtient aucun outil de détail salaires', () => {
    for (const t of salaryDetailTools) {
      expect(FINANCE_TOOL_NAMES.has(t.name)).toBe(false);
    }
  });

  it('ANALYSTE n’obtient aucun outil de détail salaires', () => {
    for (const t of salaryDetailTools) {
      expect(READ_ONLY_TOOL_NAMES.has(t.name)).toBe(false);
    }
  });

  it('l’assistant IA ne voit aucun détail salaires, quel que soit le rôle', () => {
    for (const role of ROLES) {
      const forRole = assistantTools(role).map((t) => t.name);
      for (const t of salaryDetailTools) {
        expect(forRole).not.toContain(t.name);
      }
    }
  });

  it('ADMIN est le seul ensemble où figure le détail', () => {
    expect(ADMIN_ONLY_TOOL_NAMES.size).toBeGreaterThan(0);
    for (const t of salaryDetailTools) {
      expect(ADMIN_ONLY_TOOL_NAMES.has(t.name)).toBe(true);
    }
  });

  it('tout outil `scope: admin` est exclu des trois rôles non-admin', () => {
    for (const n of names(ADMIN_ONLY_TOOL_NAMES)) {
      expect(NON_ADMIN_TOOL_NAMES.has(n)).toBe(false);
      expect(FINANCE_TOOL_NAMES.has(n)).toBe(false);
      expect(READ_ONLY_TOOL_NAMES.has(n)).toBe(false);
    }
  });

  it('le point mort n’a qu’un agrégat, sans détail nominatif annoncé', () => {
    const breakEven = tools.find((t) => t.name === 'get_break_even');
    expect(breakEven).toBeDefined();
    expect(
      /salaire|salary|employ|paie|payroll|rémunér/i.test(breakEven!.description)
    ).toBe(false);
  });
});
