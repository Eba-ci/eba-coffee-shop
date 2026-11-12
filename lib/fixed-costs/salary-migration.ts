// lib/fixed-costs/salary-migration.ts
//
// Identification PURE des charges fixes « salaires » saisies avant la rubrique
// Salaires (#407), pour la migration `pnpm db:migrate-salary-fixed-costs` et sa
// restauration. Aucun accès base ici : le script charge les charges et applique
// le plan.
//
// Depuis #409, les salaires ne sont plus des charges fixes : ils se saisissent
// en employés + taux (ADMIN seul) et le point mort lit leur total mensuel global
// (`getMonthlySalaryTotal`). Les charges « salaires » doivent donc disparaître
// de la liste des charges fixes, sinon le total serait compté deux fois (ou pas
// du tout une fois la rubrique utilisée).

import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';
import type { FixedCostPeriodicity } from '@/generated/prisma/enums';
import type { InstallmentLike } from './schedule';

/** Toute entité nommée + catégorie (charge fixe). */
export type SalaryNamed = {
  label: string;
  categoryName: string;
};

/**
 * Replie casse et accents (« Salaire », « salarié », « SALAIRES » → « salaire »).
 * `String.prototype.normalize('NFD')` sépare les diacritiques, qu'on retire.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Mot-clé replié, comparé aux libellés repliés. */
const SALARY_KEYWORD = normalizeText('salaire');

/**
 * Vrai si l'entité relève des salaires : sa catégorie est « Salaires »
 * (`SALARY_EXPENSE_CATEGORY_NAME`) OU son libellé contient « salaire » — casse
 * et accents ignorés. **Prédicat unique** de la migration.
 */
export function isSalaryNamed(named: SalaryNamed): boolean {
  return (
    normalizeText(named.categoryName) ===
      normalizeText(SALARY_EXPENSE_CATEGORY_NAME) ||
    normalizeText(named.label).includes(SALARY_KEYWORD)
  );
}

/** Charge fixe à restaurer (tous les champs de `FixedCost` + ses échéances). */
export type SalaryFixedCostRecord = {
  id: string;
  label: string;
  amount: number;
  periodicity: FixedCostPeriodicity;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  categoryId: string;
  categoryName: string;
  active: boolean;
  note: string | null;
  sortOrder: number;
  installments: InstallmentLike[];
};

/** Vrai si la charge relève des salaires (ses propres champs). */
export function isSalaryFixedCost(cost: SalaryFixedCostRecord): boolean {
  return isSalaryNamed(cost);
}

/** Total (et effectif) des charges à retirer pour une périodicité donnée. */
export type PeriodicityTotal = {
  periodicity: FixedCostPeriodicity;
  total: number;
  count: number;
};

/** Plan d'actions : ce qui sera (ou a été) retiré de la liste des charges fixes. */
export type SalaryMigrationPlan = {
  /** Charges concernées, triées par libellé puis id. */
  candidates: SalaryFixedCostRecord[];
  /** Somme brute (attent : les périodicités ne s'additionnent pas entre elles). */
  totalAmount: number;
  /** Montants regroupés par périodicité : ce que l'admin devra ressaisir. */
  totalsByPeriodicity: PeriodicityTotal[];
  /** Aucune charge « salaires » : la migration est déjà passée (idempotence). */
  empty: boolean;
};

/** Ordre d'affichage canonique des périodicités. */
const PERIODICITY_ORDER: FixedCostPeriodicity[] = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
];

const byLabelThenId = (a: SalaryFixedCostRecord, b: SalaryFixedCostRecord) =>
  a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

function groupByPeriodicity(
  records: readonly SalaryFixedCostRecord[]
): PeriodicityTotal[] {
  return PERIODICITY_ORDER.map((periodicity) => {
    const group = records.filter((r) => r.periodicity === periodicity);
    return {
      periodicity,
      total: group.reduce((sum, r) => sum + r.amount, 0),
      count: group.length,
    };
  }).filter((g) => g.count > 0);
}

/**
 * Construit le plan de migration à partir des charges existantes. Purement
 * déterministe : un second passage sur les charges restantes donne un plan vide.
 */
export function buildSalaryMigrationPlan(
  costs: readonly SalaryFixedCostRecord[]
): SalaryMigrationPlan {
  const candidates = costs.filter(isSalaryFixedCost).sort(byLabelThenId);
  return {
    candidates,
    totalAmount: candidates.reduce((sum, c) => sum + c.amount, 0),
    totalsByPeriodicity: groupByPeriodicity(candidates),
    empty: candidates.length === 0,
  };
}

/** Plan de restauration : ne recrée que ce qui manque (idempotence par id). */
export type SalaryRestorePlan = {
  /** Charges absentes de la base : à recréer. */
  toCreate: SalaryFixedCostRecord[];
  /** Charges déjà présentes (id connu) : laissées intactes. */
  alreadyPresent: SalaryFixedCostRecord[];
  empty: boolean;
};

/**
 * Construit le plan de restauration depuis une sauvegarde et l'ensemble des ids
 * déjà en base. Idempotent : rejouer `--restore` ne recrée rien.
 */
export function buildSalaryRestorePlan(
  records: readonly SalaryFixedCostRecord[],
  existingIds: ReadonlySet<string>
): SalaryRestorePlan {
  const toCreate = records
    .filter((r) => !existingIds.has(r.id))
    .sort(byLabelThenId);
  return {
    toCreate,
    alreadyPresent: records.filter((r) => existingIds.has(r.id)),
    empty: toCreate.length === 0,
  };
}
