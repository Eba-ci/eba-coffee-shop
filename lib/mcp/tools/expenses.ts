// lib/mcp/tools/expenses.ts
//
// Outils MCP — dépenses (lecture, écriture, justificatifs).

import { z } from 'zod';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { uploadReceiptImage } from '@/lib/cloudinary';
import { ALLOWED_IMAGE_MIME_TYPES, imageUrlSchema } from '@/lib/schemas/upload';
import { listExpenses, getExpenseSummary } from '@/lib/expenses';
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from '@/lib/expense-mutations';
import {
  expenseInputSchema,
  expenseFiltersSchema,
} from '@/lib/schemas/expense';
import {
  idSchema,
  rangeSchema,
  toRange,
  resolveStoredImageUrl,
} from './helpers';
import type { McpTool } from './types';

export const expensesTools: McpTool[] = [
  // — Dépenses : opérations —
  {
    name: 'list_expenses',
    toolset: 'finance',
    scope: 'finance',
    title: 'Lister les dépenses',
    description:
      'Renvoie les dépenses filtrées par plage de dates (`from`/`to`, ' +
      '`YYYY-MM-DD`, jour civil Abidjan), `categoryId`, `paymentMethod` ' +
      '(CASH/WAVE/BANK/OTHER) et/ou `search` (fournisseur ou note), avec le ' +
      'total. Chaque dépense porte un numéro de reçu `receiptNo` ' +
      '(DEP-YYYY-MM-NNNN, séquence remise à zéro chaque mois). Tous les ' +
      'filtres sont optionnels. Les lignes de salaire (réservées à l’ADMIN) ne ' +
      'sont jamais renvoyées ici.',
    inputSchema: expenseFiltersSchema,
    readOnly: true,
    handler: (args) => {
      const f = args as {
        from?: string;
        to?: string;
        categoryId?: string;
        paymentMethod?: 'CASH' | 'WAVE' | 'BANK' | 'OTHER';
        search?: string;
      };
      return listExpenses({
        dateFrom: parseDateOnlyToUTC(f.from),
        dateTo: parseDateOnlyToUTC(f.to),
        categoryId: f.categoryId,
        paymentMethod: f.paymentMethod,
        search: f.search,
      });
    },
  },
  {
    name: 'get_expense_summary',
    toolset: 'finance',
    scope: 'finance',
    title: 'Synthèse des dépenses',
    description:
      'Renvoie le total des dépenses et leur ventilation par catégorie sur ' +
      'une plage de dates. Montants en francs CFA.',
    inputSchema: rangeSchema,
    readOnly: true,
    handler: (args) => {
      const { from, to } = toRange(args);
      return getExpenseSummary(from, to);
    },
  },
  {
    name: 'create_expense',
    toolset: 'finance',
    scope: 'finance',
    title: 'Créer une dépense',
    description:
      '⚠️ Achats fournisseur : préfère `prepare_purchase` → `confirm_purchase`. ' +
      'Ici : dépense simple. `date` YYYY-MM-DD, `amount` FCFA entier, ' +
      '`categoryId` de `list_expense_categories`, `paymentMethod` ' +
      'CASH/WAVE/BANK/OTHER (défaut CASH). Photo : `set_expense_receipt` après ' +
      'création. Renvoie `receiptNo`. `items[]` (optionnel) détaille par ' +
      'article : `articleName` ou `articleId` (`search_article`), `rawLabel`, ' +
      '`formatQty`/`formatSize`/`unit`, `unitPrice` ; `amount` de ligne ' +
      'dérivable de formatQty × formatSize × unitPrice, et la somme des lignes ' +
      'doit égaler le total.',
    inputSchema: expenseInputSchema,
    readOnly: false,
    handler: (args) => createExpense(args),
  },
  {
    name: 'update_expense',
    toolset: 'finance',
    scope: 'finance',
    title: 'Modifier une dépense',
    description:
      'Met à jour une dépense de façon PARTIELLE : ne fournis que les champs à ' +
      'modifier. Le numéro de reçu (`receiptNo`) est immuable et ne change ' +
      'jamais, même si la `date` est modifiée. `items` suit la même logique ' +
      'que `create_expense` ; `items: null` retire tout le détail existant (la ' +
      'dépense redevient globale), `items: [...]` remplace entièrement les ' +
      'lignes (la somme doit égaler le montant).',
    inputSchema: expenseInputSchema
      .partial()
      .omit({ fixedCostId: true, dueDate: true })
      .extend({ id: idSchema }),
    readOnly: false,
    handler: (args) => {
      const { id, ...rest } = args as { id: string } & Record<string, unknown>;
      return updateExpense(id, rest);
    },
  },
  {
    name: 'delete_expense',
    toolset: 'finance',
    scope: 'finance',
    title: 'Supprimer une dépense',
    description: 'Supprime définitivement une dépense. Action irréversible.',
    inputSchema: z.object({ id: idSchema }),
    readOnly: false,
    handler: (args) => deleteExpense((args as { id: string }).id),
  },
  {
    name: 'set_expense_receipt',
    toolset: 'finance',
    scope: 'finance',
    title: 'Joindre un justificatif à une dépense',
    description:
      'Associe une photo de justificatif à une dépense. Deux modes : (1) ' +
      '`imageUrl` — une URL http(s) est TÉLÉCHARGÉE côté serveur puis stockée ' +
      'localement (un chemin `/uploads/...` déjà local est conservé) ; (2) ' +
      '`imageBase64` (base64 brut ou data URI) + `mimeType`. Formats : ' +
      ALLOWED_IMAGE_MIME_TYPES.join(', ') +
      ' (converties automatiquement en WebP, redimensionnées, max 25 MB).',
    inputSchema: z
      .object({
        id: idSchema,
        imageBase64: z.string().min(1).optional(),
        mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES).optional(),
        imageUrl: imageUrlSchema.optional(),
      })
      .refine((v) => Boolean(v.imageBase64) || Boolean(v.imageUrl), {
        message: 'Fournis soit `imageBase64`, soit `imageUrl`.',
      }),
    readOnly: false,
    handler: async (args) => {
      const { id, ...image } = args as {
        id: string;
        imageBase64?: string;
        mimeType?: string;
        imageUrl?: string;
      };
      const url = await resolveStoredImageUrl(
        image,
        uploadReceiptImage,
        uploadReceiptImage
      );
      return updateExpense(id, { receiptUrl: url });
    },
  },
];
