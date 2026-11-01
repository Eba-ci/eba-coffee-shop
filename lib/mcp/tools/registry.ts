// lib/mcp/tools/registry.ts
//
// Registre des outils MCP : assemble les modules par domaine (ordre inchangé)
// et dérive les index d'accès (par nom, par toolset, par rôle).
// Ajouter un domaine = créer un module `McpTool[]` + une ligne ci-dessous.

import { TOOLSET_NAMES, type McpTool, type ToolsetName } from './types';
import { menuReadTools } from './menu-read';
import { statsTools } from './stats';
import { expenseCategoriesTools } from './expense-categories';
import { expensesTools } from './expenses';
import { expensePurchasesTools } from './expense-purchases';
import { expenseArticlesTools } from './expense-articles';
import { expenseMaintenanceTools } from './expense-maintenance';
import { investmentsTools } from './investments';
import { revenueAdjustmentsTools } from './revenue-adjustments';
import { cashClosingTools } from './cash-closing';
import { ordersTools } from './orders';
import { ordersOpsTools } from './orders-ops';
import { customersTools } from './customers';
import { loyaltyTools } from './loyalty';
import { contactTools } from './contact';
import { menuCategoriesTools } from './menu-categories';
import { menuProductsTools } from './menu-products';
import { menuStockTools } from './menu-stock';
import { menuStockHistoryTools } from './menu-stock-history';
import { menuSchedulesTools } from './menu-schedules';
import { menuExtrasTools } from './menu-extras';
import { inventoryTools } from './inventory';
import { pollsTools } from './polls';
import { pollOptionsTools } from './poll-options';
import { tiktokTools } from './tiktok';
import { refundsTools } from './refunds';

export const tools: McpTool[] = [
  ...menuReadTools,
  ...statsTools,
  ...expenseCategoriesTools,
  ...expensesTools,
  ...expensePurchasesTools,
  ...expenseArticlesTools,
  ...expenseMaintenanceTools,
  ...investmentsTools,
  ...revenueAdjustmentsTools,
  ...refundsTools,
  ...cashClosingTools,
  ...ordersTools,
  ...ordersOpsTools,
  ...customersTools,
  ...loyaltyTools,
  ...contactTools,
  ...menuCategoriesTools,
  ...menuProductsTools,
  ...menuStockTools,
  ...menuStockHistoryTools,
  ...menuSchedulesTools,
  ...menuExtrasTools,
  ...inventoryTools,
  ...pollsTools,
  ...pollOptionsTools,
  ...tiktokTools,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

/**
 * Partition des noms d'outils par domaine fonctionnel (`toolset`). Utilisé
 * par `app/api/mcp/route.ts` pour le filtrage `?toolset=` — composable par
 * intersection avec les restrictions de rôle ci-dessous, jamais un
 * remplacement.
 */
export const TOOLSET_TOOL_NAMES: Record<
  ToolsetName,
  Set<string>
> = Object.fromEntries(
  TOOLSET_NAMES.map((toolset) => [
    toolset,
    new Set(tools.filter((t) => t.toolset === toolset).map((t) => t.name)),
  ])
) as Record<ToolsetName, Set<string>>;

/**
 * Noms des outils accessibles au rôle COMPTABLE (finance uniquement).
 * Utilisé par `withRoleGuard` dans `app/api/mcp/route.ts` pour restreindre
 * `tools/list`/`tools/call`.
 */
export const FINANCE_TOOL_NAMES = new Set(
  tools.filter((t) => t.scope === 'finance').map((t) => t.name)
);

/**
 * Noms des outils accessibles au rôle ANALYSTE (lecture seule, tous
 * domaines). Utilisé par `withRoleGuard` dans `app/api/mcp/route.ts` pour
 * restreindre `tools/list`/`tools/call` aux outils annotés `readOnly: true`.
 */
export const READ_ONLY_TOOL_NAMES = new Set(
  tools.filter((t) => t.readOnly).map((t) => t.name)
);
