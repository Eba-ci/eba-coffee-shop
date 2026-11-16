import { readdirSync, readFileSync } from 'node:fs';
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

// Écrans dérivés par glob : tout .ts/.tsx (hors tests) sous ces deux dossiers.
// Exclus : fichiers qui gardent légitimement `useRouter` pour des
// `router.replace`/`push` (filtres d'URL, tables) ou dont le `refresh` relève
// du reste de #477 (use-expense-form.ts), hors périmètre ici.
const EXCLUDED = ['depenses/_components/expense-form/use-expense-form.ts'];

function walk(dir: string): string[] {
  return readdirSync(join(DIR, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(rel);
    const isSource = /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name);
    return isSource ? [rel] : [];
  });
}

const SCREENS = ['employes', 'depenses']
  .flatMap(walk)
  .filter((p) => !EXCLUDED.includes(p));

const read = (p: string) => readFileSync(join(DIR, p), 'utf8');

describe('aucun second rendu côté client redondant (#477)', () => {
  it.each(SCREENS)('%s', (p) => {
    expect(read(p)).not.toMatch(/\.refresh\b/);
  });

  it.each(EMPLOYES_ACTIONS)('%s revalide /dashboard/employes', (p) => {
    expect(read(p)).toContain("revalidatePath('/dashboard/employes'");
  });

  it.each(DEPENSES_ACTIONS)('%s revalide /dashboard/depenses', (p) => {
    expect(read(p)).toMatch(/revalidatePath\('\/dashboard\/depenses'\)/);
  });
});
