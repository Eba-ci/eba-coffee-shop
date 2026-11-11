// lib/fixed-costs/salary-migration.ts
//
// Identification PURE des charges fixes « salaires » saisies avant la rubrique
// Salaires (#407), pour la migration `pnpm db:migrate-salary-fixed-costs`.
// Aucun accès base ici : le script charge les charges et applique le plan.
//
// Depuis #409, les salaires ne sont plus des charges fixes : ils se saisissent
// en employés + taux (ADMIN seul) et le point mort lit leur total mensuel global
// (`getMonthlySalaryTotal`). Les charges « salaires » doivent donc disparaître
// de la liste des charges fixes, sinon le total serait compté deux fois (ou pas
// du tout une fois la rubrique utilisée).

import type { FixedCostPeriodicity } from '@/generated/prisma/enums';
import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';

/** Forme minimale d'une charge fixe pour l'identification. */
export type SalaryFixedCostLike = {
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
 * Vrai si la charge fixe relève des salaires : sa catégorie est « Salaires »
 * (`SALARY_EXPENSE_CATEGORY_NAME`) OU son libellé contient « salaire » — casse
 * et accents ignorés.
 */
export function isSalaryFixedCost(cost: SalaryFixedCostLike): boolean {
  return (
    normalizeText(cost.categoryName) ===
      normalizeText(SALARY_EXPENSE_CATEGORY_NAME) ||
    normalizeText(cost.label).includes(SALARY_KEYWORD)
  );
}

/** Charge fixe candidate à la migration (données brutes, pour le rapport). */
export type SalaryFixedCostCandidate = {
  id: string;
  label: string;
  amount: number;
  periodicity: FixedCostPeriodicity;
  categoryName: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
};

/** Plan d'actions : ce qui sera (ou a été) retiré de la liste des charges fixes. */
export type SalaryMigrationPlan = {
  /** Charges concernées, triées par libellé puis id. */
  candidates: SalaryFixedCostCandidate[];
  /** Somme des montants par période : ce que l'admin devra ressaisir. */
  totalAmount: number;
  /** Aucune charge « salaires » : la migration est déjà passée (idempotence). */
  empty: boolean;
};

const byLabelThenId = (
  a: SalaryFixedCostCandidate,
  b: SalaryFixedCostCandidate
) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

/**
 * Construit le plan de migration à partir des charges existantes. Purement
 * déterministe : un second passage sur les charges restantes donne un plan vide.
 */
export function buildSalaryMigrationPlan(
  costs: readonly SalaryFixedCostCandidate[]
): SalaryMigrationPlan {
  const candidates = costs.filter(isSalaryFixedCost).sort(byLabelThenId);
  return {
    candidates,
    totalAmount: candidates.reduce((sum, c) => sum + c.amount, 0),
    empty: candidates.length === 0,
  };
}
