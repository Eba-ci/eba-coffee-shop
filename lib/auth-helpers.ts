import { cache } from 'react';
import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  DASHBOARD_ROLES,
  ORDERS_VIEW_ROLES,
  PAYROLL_ROLES,
  REFUND_VIEW_ROLES,
} from '@/config/constants';
import type { UserRole } from '@/generated/prisma/client';

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  disabledAt?: Date | null;
};

export type AuthorizedSession = {
  user: SessionUser;
};

// ASSISTANT_MANAGER = même accès opérationnel que MANAGER (menu, caisse,
// commandes, clôture, préparation, inventaire, clients, sondages, stats)
// SANS les modules finance (dépenses, investissements, régularisations) et
// sans accès au serveur MCP (cf. `MCP_ROLES` dans `app/api/mcp/route.ts`).
const MANAGER_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'];
// Gestion du menu (catégories, produits, stock, plannings, extras globaux,
// carte PDF) : MANAGER_ROLES + CASHIER, qui doit pouvoir corriger le menu
// (rupture, prix, nouveau produit) sans dépendre d'un manager sur place.
const MENU_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'CASHIER',
];
const FINANCE_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'COMPTABLE'];
const STATS_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'COMPTABLE',
  'ANALYSTE',
];
const CASHIER_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'CASHIER',
];
const KITCHEN_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'CASHIER',
  'KITCHEN',
];
// Réappro (lots, annulation, import Excel « achats ») et réglages d'inventaire
// (seuils bas stock…) : KITCHEN_ROLES SANS CASHIER. Le caissier garde la
// consultation du stock et la saisie de comptage physique (`requireKitchen`),
// mais ne modifie plus les quantités/coûts d'achat ni les réglages.
const INVENTORY_ADMIN_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'KITCHEN',
];
// Destinataires du push « nouvelle commande en cuisine » : KITCHEN_ROLES SANS
// CASHIER. Le caissier reçoit déjà « nouvelle commande » (création) et c'est
// lui qui déclenche l'envoi en cuisine la plupart du temps — l'inclure ne
// ferait que dupliquer le bruit. On ne se limite pas à `['KITCHEN']` pour
// autant : dans une boutique où personne n'est connecté avec ce rôle, plus
// aucun appareil ne serait notifié.
const KITCHEN_STAFF_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'KITCHEN',
];
const CLOTURE_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'CASHIER',
  'COMPTABLE',
];
// DASHBOARD_ROLES vit dans config/constants.ts : l'UI publique (navbar, footer,
// FAB) en a besoin côté client, et ce module importe `next/headers`.

// Validation runtime du shape renvoyé par Better Auth.
//
// Pourquoi : `auth.api.getSession()` est typé via inférence côté Better Auth,
// mais le résultat dépend des plugins (emailOTP, nextCookies, additionalFields).
// Un cast `as unknown as AuthorizedSession` masquerait toute dérive de shape
// (ex. plugin qui change `role` en `string | undefined`) et ouvrirait la porte
// à une coercion silencieuse côté `requireRole`.
//
// Périmètre : on valide UNIQUEMENT les champs critiques (`user.id`, `user.role`)
// car ce sont les seuls consommés par les guards. On reste permissif sur les
// autres (`name` nullable, `email` requis comme le type existant).
export const authorizedSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string(),
    name: z.string().nullable(),
    role: z.enum([
      'USER',
      'ADMIN',
      'CASHIER',
      'KITCHEN',
      'MANAGER',
      'COMPTABLE',
      'ASSISTANT_MANAGER',
      'ANALYSTE',
    ]),
    // `.nullish()` plutôt que `.nullable()` : une session qui ne porte pas
    // ce champ (mocks de test, ancienne session Better Auth avant l'ajout du
    // additionalField) doit être traitée comme "non désactivé", pas rejetée.
    disabledAt: z.coerce.date().nullish(),
  }),
});

// `cache()` déduplique les lookups de session au sein d'une même requête
// serveur (React request cache) : le layout dashboard et le guard `require*`
// de chaque page appellent tous deux `getSession()` — sans ce wrapper, ça
// ferait 2 appels `auth.api.getSession()` (donc 2 requêtes DB) par requête.
const getSession = cache(async (): Promise<AuthorizedSession | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    // Aucune session lisible : le cookie de session est absent ou non transmis.
    // C'est généralement un problème de cookie (`Secure`/préfixe, reverse proxy
    // qui ne forwarde pas X-Forwarded-Proto) et NON un problème de rôle.
    console.warn(
      '[auth-helpers] getSession: aucune session (cookie de session absent ou non lu)'
    );
    return null;
  }

  const parsed = authorizedSessionSchema.safeParse(session);
  if (!parsed.success) {
    // Dérive de shape côté Better Auth — on refuse explicitement plutôt que
    // de laisser un cast silencieux faire confiance à des données invalides.
    // On logge la valeur réelle de `role`/`name` pour diagnostiquer rapidement.
    console.error(
      '[auth-helpers] Session présente mais shape invalide — role=%o name=%o erreurs=%o',
      (session as { user?: { role?: unknown } }).user?.role,
      (session as { user?: { name?: unknown } }).user?.name,
      parsed.error.flatten()
    );
    return null;
  }
  if (parsed.data.user.disabledAt) {
    // Compte désactivé (cf. `disableUser`, app/(dashboard)/dashboard/utilisateurs/actions.ts) :
    // traité comme non connecté. Le cookie de session reste valide côté
    // Better Auth, mais `disableUser` purge déjà les lignes `Session` du
    // compte — ce check couvre le court instant avant cette purge et toute
    // session recréée entre-temps.
    console.warn(
      '[auth-helpers] getSession: compte désactivé (id=%s)',
      parsed.data.user.id
    );
    return null;
  }
  return parsed.data;
});

/** Renvoie la session courante (ou null si non connecté). */
export async function getCurrentSession(): Promise<AuthorizedSession | null> {
  return getSession();
}

async function requireRole(allowed: UserRole[]): Promise<AuthorizedSession> {
  const session = await getSession();
  if (!session || !allowed.includes(session.user.role)) {
    throw new Error('Non autorisé');
  }
  return session;
}

/**
 * Autorise `roles` OU le rôle ANALYSTE (lecture seule, tous domaines).
 *
 * À utiliser UNIQUEMENT sur les guards de page (vue) — jamais sur un guard
 * qui protège aussi une mutation dans un `actions.ts`, sous peine de donner
 * involontairement des droits d'écriture à ANALYSTE.
 */
export async function requireRoleOrAnalyst(
  roles: UserRole[]
): Promise<AuthorizedSession> {
  return requireRole([...roles, 'ANALYSTE']);
}

/** ADMIN seul. */
export async function requireAdmin(): Promise<AuthorizedSession> {
  return requireRole(['ADMIN']);
}

/** ADMIN, MANAGER ou ASSISTANT_MANAGER. */
export async function requireManager(): Promise<AuthorizedSession> {
  return requireRole(MANAGER_ROLES);
}

/** ADMIN, MANAGER, ASSISTANT_MANAGER ou CASHIER (gestion complète du menu). */
export async function requireMenu(): Promise<AuthorizedSession> {
  return requireRole(MENU_ROLES);
}

/** ADMIN, MANAGER ou COMPTABLE (gestion financière). */
export async function requireFinance(): Promise<AuthorizedSession> {
  return requireRole(FINANCE_ROLES);
}

/**
 * Paie nominative (#440) : ADMIN + COMPTABLE. Couvre la page Employés et
 * CHAQUE lecture server-side qu'elle appelle (`lib/employees/queries.ts`) :
 * MANAGER et ANALYSTE n'obtiennent ni entrée de menu, ni page, ni donnée.
 */
export async function requirePayroll(): Promise<AuthorizedSession> {
  return requireRole(PAYROLL_ROLES);
}

/** ADMIN, MANAGER, ASSISTANT_MANAGER ou COMPTABLE (lecture des statistiques). */
export async function requireStats(): Promise<AuthorizedSession> {
  return requireRole(STATS_ROLES);
}

/** ADMIN, MANAGER ou CASHIER. */
export async function requireCashier(): Promise<AuthorizedSession> {
  return requireRole(CASHIER_ROLES);
}

/** ADMIN, MANAGER, ASSISTANT_MANAGER, CASHIER ou KITCHEN (tout staff cuisine + caisse). */
export async function requireKitchen(): Promise<AuthorizedSession> {
  return requireRole(KITCHEN_ROLES);
}

/** ADMIN, MANAGER, ASSISTANT_MANAGER ou KITCHEN (réappro + réglages inventaire). */
export async function requireInventoryAdmin(): Promise<AuthorizedSession> {
  return requireRole(INVENTORY_ADMIN_ROLES);
}

/** ADMIN, MANAGER, ASSISTANT_MANAGER, CASHIER ou COMPTABLE (accès à la clôture de caisse). */
export async function requireCloture(): Promise<AuthorizedSession> {
  return requireRole(CLOTURE_ROLES);
}

/** N'importe quel rôle staff (tous sauf USER). */
export async function requireDashboardAccess(): Promise<AuthorizedSession> {
  return requireRole(DASHBOARD_ROLES);
}

/**
 * Consultation des commandes (`/dashboard/commandes` + détail). Même liste que
 * celle qui pilote l'entrée « Commandes » de la barre latérale
 * (`ORDERS_VIEW_ROLES`, config/constants.ts) : KITCHEN et COMPTABLE sont exclus.
 *
 * Lecture uniquement — ANALYSTE en fait partie. Les mutations restent gardées
 * par `requireCashier` côté server actions, et les boutons correspondants sont
 * masqués côté page (`canCash`).
 */
export async function requireOrdersView(): Promise<AuthorizedSession> {
  return requireRole(ORDERS_VIEW_ROLES);
}

/**
 * Consultation des remboursements (`/dashboard/remboursements`). Les écritures
 * sont gardées par `lib/refunds` (demandeurs : REFUND_REQUEST_ROLES ; validation :
 * REFUND_APPROVER_ROLES), jamais par ce seul garde de page.
 */
export async function requireRefundsView(): Promise<AuthorizedSession> {
  return requireRole(REFUND_VIEW_ROLES);
}

export const ROLE_GROUPS = {
  DASHBOARD: DASHBOARD_ROLES,
  MANAGER_PLUS: MANAGER_ROLES,
  MENU: MENU_ROLES,
  FINANCE: FINANCE_ROLES,
  PAYROLL: PAYROLL_ROLES,
  STATS: STATS_ROLES,
  CASHIER_PLUS: CASHIER_ROLES,
  KITCHEN_PLUS: KITCHEN_ROLES,
  INVENTORY_ADMIN: INVENTORY_ADMIN_ROLES,
  KITCHEN_STAFF: KITCHEN_STAFF_ROLES,
  CLOTURE: CLOTURE_ROLES,
  ORDERS_VIEW: ORDERS_VIEW_ROLES,
} as const;
