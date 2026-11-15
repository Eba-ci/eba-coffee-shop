import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #477 : ces écrans appellent une server action qui revalide déjà le chemin
// affiché (`revalidatePath`). Un `router.refresh()` en plus refait un rendu
// RSC complet. Ce garde-fou empêche de le réintroduire.
const DIR = __dirname;

const EMPLOYES_ACTIONS = ['employes/actions.ts', 'employes/salary-actions.ts'];
const DEPENSES_ACTIONS = [
  'depenses/actions.ts',
  'depenses/_components/paiements/batch-actions.ts',
];

const SCREENS = [
  'employes/[employeeId]/_components/sections/cancel-payment-button.tsx',
  'employes/_components/arrears/overpaid-bonus-button.tsx',
  'employes/_components/arrears/arrears-settle-drawer.tsx',
  'employes/_components/employee-create-drawer.tsx',
  'employes/_components/employee-edit-drawer.tsx',
  'employes/_components/employee-exit-drawer.tsx',
  'employes/_components/employee-rate-drawer.tsx',
  'employes/_components/employee-row-actions.tsx',
  'employes/_components/paie/adjustment-sheet.tsx',
  'employes/_components/paie/payroll-drawer.tsx',
  'depenses/_components/paiements/use-batch-selection.ts',
  'depenses/_components/article-history/use-relink.ts',
  'depenses/_components/articles/article-merge-sheet.tsx',
  'depenses/_components/articles/article-settings-sheet.tsx',
  'depenses/articles-table.tsx',
  'depenses/expense-settings-sheet.tsx',
];

const read = (p: string) => readFileSync(join(DIR, p), 'utf8');

describe('aucun second rendu côté client redondant (#477)', () => {
  it.each(SCREENS)('%s', (p) => {
    expect(read(p)).not.toMatch(/router\.refresh\(/);
  });

  it.each(EMPLOYES_ACTIONS)('%s revalide /dashboard/employes', (p) => {
    expect(read(p)).toContain("revalidatePath('/dashboard/employes'");
  });

  it.each(DEPENSES_ACTIONS)('%s revalide /dashboard/depenses', (p) => {
    expect(read(p)).toMatch(/revalidatePath\('\/dashboard\/depenses'\)/);
  });
});
