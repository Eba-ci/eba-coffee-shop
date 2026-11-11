// scripts/migrate-salary-fixed-costs.ts
//
// Migration des charges fixes « salaires » (#407) vers la rubrique Salaires
// (ADMIN seul, #409). Une fois la migration passée, les salaires se saisissent
// en employés + taux dans l'onglet Salaires ; ils ne doivent PLUS figurer dans
// la liste des charges fixes, sinon le point mort les compterait en double.
//
//   pnpm db:migrate-salary-fixed-costs                      # simulation
//   pnpm db:migrate-salary-fixed-costs --apply --confirm    # retire
//   pnpm db:migrate-salary-fixed-costs --apply --confirm --backup /chemin/dir
//
// Idempotent : un second passage ne trouve plus rien à retirer.
//
// DANGER — après `--apply`, le total « Salaires du mois » du point mort tombe à
// 0 TANT QUE l'admin n'a pas saisi les employés et leurs taux dans l'onglet
// Salaires. Le script liste donc les montants à ressaisir et écrit une
// sauvegarde JSON (hors dépôt) pour pouvoir restaurer les charges retirées.

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_COST_PERIODICITY_LABELS } from '@/lib/schemas/fixed-cost';
import { buildSalaryMigrationPlan } from '@/lib/fixed-costs/salary-migration';
import { listFixedCosts } from '@/lib/fixed-costs/queries';
import prisma from '@/lib/prisma';

const DANGER =
  'DANGER : une fois ces charges retirées, le total « Salaires du mois » du ' +
  'point mort tombera à 0 TANT QUE l’admin n’aura pas saisi les employés et ' +
  'leurs taux dans l’onglet Salaires. Ressaisissez d’abord ce que le script ' +
  'liste ci-dessous.';

type Args = { apply: boolean; confirm: boolean; backup: string | undefined };

function parseArgs(argv: string[]): Args {
  const backupIdx = argv.indexOf('--backup');
  return {
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm'),
    backup: backupIdx >= 0 ? argv[backupIdx + 1] : undefined,
  };
}

/** Chemin par défaut de la sauvegarde : hors du dépôt (~/eba-backups). */
function defaultBackupPath(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  return path.join(homedir(), 'eba-backups', `charges-salaires-${stamp}.json`);
}

async function main() {
  const { apply, confirm, backup } = parseArgs(process.argv.slice(2));
  try {
    const plan = buildSalaryMigrationPlan(await listFixedCosts());

    if (plan.empty) {
      console.log(
        'Aucune charge fixe « salaires » à migrer : rien à faire (idempotent).'
      );
      return;
    }

    console.log(
      `\nCharges fixes « salaires » détectées : ${plan.candidates.length}`
    );
    for (const c of plan.candidates) {
      console.log(
        `  • ${c.label} — ${c.amount} F ${FIXED_COST_PERIODICITY_LABELS[c.periodicity]}` +
          (c.active ? '' : ' (inactive)')
      );
    }
    console.log(
      `\nMontant à ressaisir côté Salaires (somme des montants par période) : ` +
        `${plan.totalAmount} F.`
    );
    console.log(`\n${DANGER}`);

    if (!apply) {
      console.log(
        '\nSimulation : rien n’a été modifié. Relancez avec ' +
          '`--apply --confirm` pour retirer ces charges.'
      );
      return;
    }

    if (!confirm) {
      console.error(
        '\nRefusé : `--apply` exige `--confirm` (suppression définitive de ' +
          'charges fixes). Relancez avec `--apply --confirm`.'
      );
      process.exitCode = 1;
      return;
    }

    const target = backup ?? defaultBackupPath();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), charges: plan.candidates },
        null,
        2
      ),
      'utf8'
    );
    console.log(`\nSauvegarde écrite : ${target}`);

    const res = await prisma.fixedCost.deleteMany({
      where: { id: { in: plan.candidates.map((c) => c.id) } },
    });
    console.log(`\n${res.count} charge(s) fixe(s) retirée(s).`);
    console.log(DANGER);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  // @ts-expect-error -- propriété Bun-spécifique non typée
  import.meta.main === true ||
  (typeof process !== 'undefined' &&
    process.argv[1] === fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
