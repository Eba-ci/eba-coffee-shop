'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { requireMenu } from '@/lib/auth-helpers';
import * as menu from '@/lib/menu-mutations';
import type {
  ProductInput,
  ProductUpdate,
  CategoryInput,
  CategoryUpdate,
  ProductScheduleInput,
  ProductScheduleUpdateInput,
  ProductWeeklySpecialInput,
} from '@/lib/menu-mutations';
import { menuSettingsSchema } from '@/lib/menu-settings';
import { updateMenuSettings } from '@/lib/menu-settings-db';
import { runWithStockContext } from '@/lib/stock-history/source-context';
import { updateGlobalExtraGroups } from '@/lib/global-extras-mutations';
import type { SupplementGroupInput } from '@/lib/schemas/menu';

// Next.js redacte en production le message de toute erreur qui *traverse*
// une Server Action (générique « An error occurred in the Server
// Components render… », quel que soit le type d'erreur) : un throw ne suffit
// pas à faire remonter un message utile à l'admin. Une erreur de validation
// (ex. deux options du même nom dans un groupe) est un cas ATTENDU, pas une
// panne — on l'attrape ici et on la RENVOIE (valeur normale, non redactée)
// plutôt que de la laisser remonter comme exception.
//
// RÈGLE : toute action de ce fichier déclenchable par un clic renvoie
// `ActionResult`, jamais `void` et jamais un throw pour une erreur métier.
// L'UI peut ainsi afficher systématiquement un toast de succès ou d'échec
// (cf. `lib/hooks/use-undo-toast.tsx`). Seul `requireMenu()` lance encore —
// volontairement : il est HORS du `try`, une tentative non autorisée n'est pas
// un cas attendu à afficher mais une erreur de programmation ou une attaque.
export type ActionResult = { ok: true } | { ok: false; error: string };

// Variante qui rapporte quelque chose du serveur. Un seul cas aujourd'hui : le
// panneau « Nouveau produit » enchaîne sur `/dashboard/menu/<id>/produits/new`
// juste après avoir créé la catégorie, et a donc besoin de l'id qu'il vient de
// faire naître — sans quoi il faudrait renvoyer la personne sur la liste pour
// qu'elle recommence, ce que ce panneau existe précisément pour éviter.
// Type distinct plutôt que paramètre optionnel sur `ActionResult` : les vingt
// autres actions ne rapportent rien, et un `data` partout les obligerait à
// prouver son absence.
export type ActionResultWith<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const OK = { ok: true } as const;

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ZodError) {
    return {
      ok: false,
      error: [...new Set(err.issues.map((i) => i.message))].join(' '),
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Erreur inattendue',
  };
}

function revalidateMenu() {
  revalidatePath('/api/menu');
  revalidatePath('/carte');
  revalidatePath('/');
  // Le dashboard aussi : une mutation déclenchée depuis `[categoryId]` doit
  // rafraîchir la liste des catégories (compteur de produits) et les pages
  // sœurs (plannings, stock par goût), pas seulement la route courante.
  // `'layout'` couvre toute la section `/dashboard/menu/**` en un appel.
  revalidatePath('/dashboard/menu', 'layout');
}

/** Exécute une mutation sous garde d'autorisation et normalise le résultat. */
async function run(mutate: () => Promise<unknown>): Promise<ActionResult> {
  const session = await requireMenu();
  try {
    await runWithStockContext(
      { source: 'STAFF', actorId: session?.user?.id },
      mutate
    );
  } catch (err) {
    return fail(err);
  }
  revalidateMenu();
  return OK;
}

/**
 * Comme `run`, mais fait remonter au client ce que la mutation a produit.
 * `select` est obligatoire : il force à choisir explicitement ce qui traverse
 * la frontière serveur → client, plutôt que de laisser filer un enregistrement
 * Prisma entier dans le payload de la Server Action.
 */
async function runWith<TRaw, TOut>(
  mutate: () => Promise<TRaw>,
  select: (raw: TRaw) => TOut
): Promise<ActionResultWith<TOut>> {
  const session = await requireMenu();
  let raw: TRaw;
  try {
    raw = await runWithStockContext(
      { source: 'STAFF', actorId: session?.user?.id },
      mutate
    );
  } catch (err) {
    return fail(err);
  }
  revalidateMenu();
  return { ok: true, data: select(raw) };
}

// ── Catégories ──

export async function createCategoryAction(
  input: CategoryInput
): Promise<ActionResultWith<{ id: string; name: string }>> {
  return runWith(
    () => menu.createCategory(input),
    (category) => ({ id: category.id, name: category.name })
  );
}

export async function updateCategoryAction(
  id: string,
  input: CategoryUpdate
): Promise<ActionResult> {
  return run(() => menu.updateCategory(id, input));
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return run(() => menu.deleteCategory(id));
}

export async function toggleCategoryAvailabilityAction(
  id: string
): Promise<ActionResult> {
  return run(() => menu.toggleCategoryAvailability(id));
}

export async function moveCategoryAction(
  id: string,
  direction: 'up' | 'down'
): Promise<ActionResult> {
  return run(() => menu.moveCategory(id, direction));
}

export async function reorderCategoriesAction(
  orderedIds: string[]
): Promise<ActionResult> {
  return run(() => menu.reorderCategories(orderedIds));
}

// ── Produits ──

export async function createProductAction(
  input: ProductInput
): Promise<ActionResult> {
  return run(() => menu.createProduct(input));
}

export async function updateProductAction(
  id: string,
  input: ProductUpdate
): Promise<ActionResult> {
  return run(() => menu.updateProduct(id, input));
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  return run(() => menu.deleteProduct(id));
}

export async function toggleProductAvailabilityAction(
  id: string
): Promise<ActionResult> {
  return run(() => menu.toggleProductAvailability(id));
}

export async function toggleProductFeaturedAction(
  id: string
): Promise<ActionResult> {
  return run(() => menu.toggleProductFeatured(id));
}

export async function moveProductAction(
  id: string,
  direction: 'up' | 'down'
): Promise<ActionResult> {
  return run(() => menu.moveProduct(id, direction));
}

export async function reorderProductsAction(
  categoryId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  return run(() => menu.reorderProducts(categoryId, orderedIds));
}

// ── Stock & pause ──

export async function restockProductAction(
  id: string,
  delta: number,
  opts?: { reserveForScheduled?: boolean }
): Promise<ActionResult> {
  return run(() => {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error('Quantité invalide');
    }
    return opts
      ? menu.restockProduct(id, delta, opts)
      : menu.restockProduct(id, delta);
  });
}

export async function pauseProductAction(
  id: string,
  until: string
): Promise<ActionResult> {
  return run(() => {
    const untilDate = new Date(until);
    if (
      Number.isNaN(untilDate.getTime()) ||
      untilDate.getTime() <= Date.now()
    ) {
      throw new Error('Date de reprise invalide (doit être dans le futur)');
    }
    return menu.pauseProduct(id, untilDate);
  });
}

export async function resumeProductAction(id: string): Promise<ActionResult> {
  return run(() => menu.resumeProduct(id));
}

export async function setOptionStockAction(
  id: string,
  quantity: number | null,
  opts?: { reserveForScheduled?: boolean }
): Promise<ActionResult> {
  return run(() => {
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
      throw new Error('Quantité invalide');
    }
    return opts
      ? menu.setOptionStock(id, quantity, opts)
      : menu.setOptionStock(id, quantity);
  });
}

// ── Extras globaux ──

export async function saveGlobalExtrasAction(
  groups: SupplementGroupInput[]
): Promise<ActionResult> {
  return run(() => updateGlobalExtraGroups(groups));
}

// ── Plannings récurrents ──

export async function createProductScheduleAction(
  input: ProductScheduleInput
): Promise<ActionResult> {
  return run(() => menu.createProductSchedule(input));
}

export async function updateProductScheduleAction(
  id: string,
  input: ProductScheduleUpdateInput
): Promise<ActionResult> {
  return run(() => menu.updateProductSchedule(id, input));
}

export async function deleteProductScheduleAction(
  id: string
): Promise<ActionResult> {
  return run(() => menu.deleteProductSchedule(id));
}

// ── Spécialité de la semaine ──

export async function createProductWeeklySpecialAction(
  productId: string,
  input: ProductWeeklySpecialInput
): Promise<ActionResult> {
  return run(() => menu.createProductWeeklySpecial(productId, input));
}

export async function deleteProductWeeklySpecialAction(
  id: string
): Promise<ActionResult> {
  return run(() => menu.deleteProductWeeklySpecial(id));
}

// ── Carte PDF ──

export async function saveMenuPdfUrlAction(
  url: string | null
): Promise<ActionResult> {
  return run(() => {
    const parsed = menuSettingsSchema.safeParse({ menuPdfUrl: url });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'URL invalide');
    }
    return updateMenuSettings(parsed.data);
  });
}
