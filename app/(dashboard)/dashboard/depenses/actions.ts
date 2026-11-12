'use server';

import { revalidatePath } from 'next/cache';
import { requireFinance } from '@/lib/auth-helpers';
import * as expenses from '@/lib/expense-mutations';
import * as fixedCosts from '@/lib/fixed-costs/mutations';
import {
  syncFixedCostsFromCategories,
  type CategorySyncResult,
} from '@/lib/fixed-costs/category-sync';
import { createInventoryItem } from '@/lib/inventory-mutations';
import { updateExpenseSettings } from '@/lib/expense-settings-db';
import type { InventoryUnitInput } from '@/lib/schemas/inventory';

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdminId(): Promise<string> {
  const session = await requireFinance();
  return session.user.id;
}

function revalidate() {
  revalidatePath('/dashboard/depenses');
  revalidatePath('/dashboard/statistiques');
}

/** Exécute une mutation admin et renvoie un résultat sérialisable. */
async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidate();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

// ── Catégories ──

export async function createExpenseCategoryAction(input: {
  name: string;
  nature?: 'FIXED' | 'VARIABLE';
}): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.createExpenseCategory(input));
}

export async function updateExpenseCategoryAction(
  id: string,
  input: { name?: string; nature?: 'FIXED' | 'VARIABLE' }
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.updateExpenseCategory(id, input));
}

export async function deleteExpenseCategoryAction(
  id: string
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.deleteExpenseCategory(id));
}

// ── Dépenses ──

export async function createExpenseAction(
  input: unknown
): Promise<ActionResult> {
  const userId = await requireAdminId();
  return run(() => expenses.createExpense(input, userId));
}

export async function updateExpenseAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.updateExpense(id, input));
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.deleteExpense(id));
}

/**
 * Numérote rétroactivement les dépenses sans numéro de reçu. Idempotent.
 * Renvoie le nombre de dépenses numérotées pour le retour visuel.
 */
export async function backfillExpenseReceiptsAction(): Promise<
  { ok: true; updated: number; total: number } | { ok: false; error: string }
> {
  await requireAdminId();
  try {
    const res = await expenses.backfillExpenseReceipts();
    revalidate();
    return { ok: true, ...res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

// ── Référentiel d'articles (détail des lignes de dépense) ──

export async function renameExpenseArticleAction(
  id: string,
  input: { name: string }
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.renameExpenseArticle(id, input));
}

/** Soft delete : retire l'article des sélecteurs/de l'auto-complétion sans
 * toucher aux lignes de dépense existantes. */
export async function archiveExpenseArticleAction(
  id: string
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.archiveExpenseArticle(id));
}

/** Réglages d'un article (unité de base, suivi de stock, emplacement, prix de
 * référence en gros). Mise à jour partielle. */
export async function setExpenseArticleSettingsAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.setExpenseArticleSettings(id, input));
}

/**
 * Fusionne deux articles en double : `sourceId` est absorbé par `targetId`
 * (toutes ses lignes de dépense et alias sont re-rattachés, puis il est
 * archivé). Jamais l'inverse.
 */
export async function mergeArticlesAction(
  sourceId: string,
  targetId: string
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.mergeArticles(sourceId, targetId));
}

/**
 * Re-rattache une ligne de dépense (`ExpenseItem`) à un autre article —
 * correction d'un rapprochement erroné ou absent. Apprend l'alias
 * correspondant pour la prochaine saisie.
 */
export async function relinkExpenseItemAction(
  itemId: string,
  articleId: string
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => expenses.relinkExpenseItem(itemId, articleId));
}

/**
 * Crée une référence d'inventaire directement depuis les réglages d'un article
 * (évite l'aller-retour par l'onglet Inventaire pour lier le stock). Renvoie la
 * référence créée pour que le sélecteur la propose et la sélectionne aussitôt.
 */
export async function createInventoryReferenceAction(input: {
  name: string;
  unit?: InventoryUnitInput;
}): Promise<
  | { ok: true; item: { id: string; name: string; sku: string; unit: string } }
  | { ok: false; error: string }
> {
  const userId = await requireAdminId();
  try {
    const item = await createInventoryItem(
      { name: input.name, unit: input.unit },
      userId
    );
    revalidatePath('/dashboard/inventaire');
    revalidate();
    return {
      ok: true,
      item: { id: item.id, name: item.name, sku: item.sku, unit: item.unit },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

// ── Réglages globaux (seuils fréquence/cumul/prix aberrant, TTL brouillon) ──

export async function updateExpenseSettingsAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => updateExpenseSettings(input));
}

// ── Charges fixes (point mort) ──

export async function createFixedCostAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => fixedCosts.createFixedCost(input));
}

export async function updateFixedCostAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  await requireAdminId();
  return run(() => fixedCosts.updateFixedCost(id, input));
}

export async function deleteFixedCostAction(id: string): Promise<ActionResult> {
  await requireAdminId();
  return run(() => fixedCosts.deleteFixedCost(id));
}

/**
 * Importe les catégories de dépenses FIXED comme charges fixes (idempotent,
 * « Salaires » ignorée). Écriture : ADMIN/MANAGER/COMPTABLE (`requireFinance`,
 * l'ANALYSTE en lecture seule est refusé).
 */
export async function syncFixedCostsFromCategoriesAction(): Promise<
  ({ ok: true } & CategorySyncResult) | { ok: false; error: string }
> {
  await requireAdminId();
  try {
    const res = await syncFixedCostsFromCategories();
    revalidate();
    return { ok: true, ...res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}
