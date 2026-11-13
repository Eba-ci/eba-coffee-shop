// scripts/migrate-salary-fixed-costs.ts
//
// Migration des charges fixes « salaires » (#407) vers la rubrique Salaires
// (ADMIN seul, #409). Une fois la migration passée, les salaires se saisissent
// en employés + taux dans l'onglet Salaires ; ils ne doivent PLUS figurer dans
// la liste des charges fixes, sinon le point mort les compterait en double.
//
//   pnpm db:migrate-salary-fixed-costs                          # simulation
//   pnpm db:migrate-salary-fixed-costs --apply --confirm        # retire
//   pnpm db:migrate-salary-fixed-costs --apply --confirm --backup /chemin/sauvegarde.json
//   pnpm db:migrate-salary-fixed-costs --restore <sauvegarde.json>            # simulation
//   pnpm db:migrate-salary-fixed-costs --restore <sauvegarde.json> --apply --confirm  # restaure
//
// Idempotent : un second passage de la migration ne trouve plus rien ; une
// restauration ne recrée pas une charge dont l'id existe déjà.
//
// DANGER — après `--apply`, le total « Salaires du mois » du point mort tombe à
// 0 TANT QUE l'admin n'a pas saisi les employés et leurs taux dans l'onglet
// Salaires. Le script liste donc les montants à ressaisir (par périodicité) et
// écrit une sauvegarde JSON complète (hors dépôt) pour pouvoir restaurer.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_COST_PERIODICITY_LABELS } from '@/lib/schemas/fixed-cost';
import {
  buildSalaryMigrationPlan,
  buildSalaryRestorePlan,
  type SalaryFixedCostRecord,
  type SalaryMigrationPlan,
} from '@/lib/fixed-costs/salary-migration';
import { listFixedCosts } from '@/lib/fixed-costs/queries';
import prisma from '@/lib/prisma';
import { parseDateOnlyToUTC } from '@/lib/timezone';

const DANGER =
  'DANGER : une fois ces charges retirées, le total « Salaires du mois » du ' +
  'point mort tombera à 0 TANT QUE l’admin n’aura pas saisi les employés et ' +
  'leurs taux dans l’onglet Salaires. Ressaisissez d’abord ce que le script ' +
  'liste ci-dessous.';

type Args = {
  apply: boolean;
  confirm: boolean;
  backup: string | undefined;
  restore: string | undefined;
};

function parseArgs(argv: string[]): Args {
  const value = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm'),
    backup: value('--backup'),
    restore: value('--restore'),
  };
}

/** Chemin par défaut de la sauvegarde : hors du dépôt (~/eba-backups). */
function defaultBackupPath(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  return path.join(homedir(), 'eba-backups', `charges-salaires-${stamp}.json`);
}

/** Charge les charges fixes sous leur forme complète (champs + échéances). */
async function loadRecords(): Promise<SalaryFixedCostRecord[]> {
  const rows = await listFixedCosts();
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    amount: r.amount,
    periodicity: r.periodicity,
    startDate: r.startDate,
    endDate: r.endDate,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    active: r.active,
    note: r.note,
    sortOrder: r.sortOrder,
    installments: r.installments.map((i) => ({ ...i })),
  }));
}

function printPlan(plan: SalaryMigrationPlan) {
  console.log(
    `\nCharges fixes « salaires » détectées : ${plan.candidates.length}`
  );
  for (const c of plan.candidates) {
    const flags = c.active ? '' : ' (inactive)';
    console.log(
      `  • ${c.label} — ${c.amount} F ${FIXED_COST_PERIODICITY_LABELS[c.periodicity]}${flags}`
    );
  }
  console.log('\nMontants à ressaisir côté Salaires, par périodicité :');
  for (const g of plan.totalsByPeriodicity) {
    console.log(
      `  • ${FIXED_COST_PERIODICITY_LABELS[g.periodicity]} : ${g.total} F ` +
        `(${g.count} charge${g.count > 1 ? 's' : ''})`
    );
  }
}

async function runMigration(args: Args) {
  const plan = buildSalaryMigrationPlan(await loadRecords());

  if (plan.empty) {
    console.log(
      'Aucune charge fixe « salaires » à migrer : rien à faire (idempotent).'
    );
    return;
  }

  printPlan(plan);
  console.log(`\n${DANGER}`);

  if (!args.apply) {
    console.log(
      '\nSimulation : rien n’a été modifié. Relancez avec ' +
        '`--apply --confirm` pour retirer ces charges.'
    );
    return;
  }
  if (!args.confirm) {
    console.error(
      '\nRefusé : `--apply` exige `--confirm` (suppression définitive de ' +
        'charges fixes). Relancez avec `--apply --confirm`.'
    );
    process.exitCode = 1;
    return;
  }

  const target = args.backup ?? defaultBackupPath();
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
  console.log(`\nSauvegarde écrite (tous les champs + échéances) : ${target}`);

  const res = await prisma.fixedCost.deleteMany({
    where: { id: { in: plan.candidates.map((c) => c.id) } },
  });
  console.log(`\n${res.count} charge(s) fixe(s) retirée(s).`);
  console.log(DANGER);
}

async function runRestore(file: string, apply: boolean, confirm: boolean) {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
    charges?: SalaryFixedCostRecord[];
  };
  const charges = Array.isArray(parsed.charges) ? parsed.charges : [];
  if (charges.length === 0) {
    console.log(
      `Sauvegarde « ${file} » vide ou illisible (clé « charges » attendue).`
    );
    return;
  }

  const existing = await prisma.fixedCost.findMany({
    where: { id: { in: charges.map((c) => c.id) } },
    select: { id: true },
  });
  const plan = buildSalaryRestorePlan(
    charges,
    new Set(existing.map((e) => e.id))
  );

  console.log(`\nSauvegarde « ${file} » : ${charges.length} charge(s).`);
  console.log(
    `  • déjà présentes, laissées intactes : ${plan.alreadyPresent.length}`
  );
  console.log(`  • à recréer : ${plan.toCreate.length}`);
  for (const c of plan.toCreate) {
    console.log(
      `  • ${c.label} — ${c.amount} F ${FIXED_COST_PERIODICITY_LABELS[c.periodicity]}`
    );
  }

  if (plan.empty) {
    console.log('\nRien à restaurer (idempotent).');
    return;
  }
  if (!apply) {
    console.log(
      '\nSimulation : rien n’a été recréé. Relancez avec ' +
        '`--apply --confirm` pour restaurer.'
    );
    return;
  }
  if (!confirm) {
    console.error(
      '\nRefusé : `--apply` exige `--confirm` (recréation de charges fixes). ' +
        'Relancez avec `--apply --confirm`.'
    );
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const c of plan.toCreate) {
      await tx.fixedCost.create({
        data: {
          id: c.id,
          label: c.label,
          amount: c.amount,
          periodicity: c.periodicity,
          startDate: parseDateOnlyToUTC(c.startDate)!,
          endDate: c.endDate ? parseDateOnlyToUTC(c.endDate)! : null,
          categoryId: c.categoryId,
          active: c.active,
          note: c.note,
          sortOrder: c.sortOrder,
          installments: {
            create: c.installments.map((i) => ({
              monthOffset: i.monthOffset,
              day: i.day,
              amount: i.amount,
            })),
          },
        },
      });
    }
  });
  console.log(`\n${plan.toCreate.length} charge(s) restaurée(s).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.restore) await runRestore(args.restore, args.apply, args.confirm);
    else await runMigration(args);
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
