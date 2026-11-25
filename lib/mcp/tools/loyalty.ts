// lib/mcp/tools/loyalty.ts
//
// Outils MCP — fidélité (carte à tampons et réglages).

import { z } from 'zod';
import { getCustomerByPhone } from '@/lib/customers';
import { getLoyaltyCard, getLoyaltyCardByPhone } from '@/lib/loyalty';
import { adjustStamps } from '@/lib/loyalty-mutations';
import { setCustomerLoyaltyDisabled } from '@/lib/customer-loyalty';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
} from '@/lib/loyalty-settings-db';
import {
  loyaltySettingsSchema,
  type LoyaltySettings,
} from '@/lib/loyalty-settings';
import type { McpTool } from './types';

export const loyaltyTools: McpTool[] = [
  // — Fidélité (carte à tampons) —
  {
    name: 'get_loyalty_card',
    toolset: 'crm',
    title: 'Carte de fidélité d’un client',
    description:
      'Renvoie l’avancement de la carte à tampons d’un client et ses ' +
      'récompenses disponibles. Fournis `id` ou `phone` (normalisé ' +
      'automatiquement). Null si introuvable.',
    inputSchema: z
      .object({
        id: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
      })
      .refine((v) => Boolean(v.id) || Boolean(v.phone), {
        message: 'Fournis `id` ou `phone`.',
      }),
    readOnly: true,
    handler: (args) => {
      const { id, phone } = args as { id?: string; phone?: string };
      return id ? getLoyaltyCard(id) : getLoyaltyCardByPhone(phone!);
    },
  },
  {
    name: 'adjust_loyalty_stamps',
    toolset: 'crm',
    title: 'Ajuster les tampons d’un client',
    description:
      'Ajuste manuellement le compteur de tampons (correction). `delta` peut ' +
      'être négatif (le compteur ne descend pas sous 0). Tracé au journal de ' +
      'fidélité. Fournis `id` ou `phone`.',
    inputSchema: z
      .object({
        id: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        delta: z
          .number()
          .int()
          .refine((n) => n !== 0, 'delta non nul requis'),
        note: z.string().max(200).optional(),
      })
      .refine((v) => Boolean(v.id) || Boolean(v.phone), {
        message: 'Fournis `id` ou `phone`.',
      }),
    readOnly: false,
    handler: async (args) => {
      const { id, phone, delta, note } = args as {
        id?: string;
        phone?: string;
        delta: number;
        note?: string;
      };
      let customerId = id;
      if (!customerId) {
        const c = await getCustomerByPhone(phone!);
        if (!c) throw new Error('Client introuvable');
        customerId = c.id;
      }
      const stampCount = await adjustStamps(customerId, delta, note);
      return { customerId, stampCount };
    },
  },
  {
    name: 'set_customer_loyalty_disabled',
    toolset: 'crm',
    title: 'Désactiver / réactiver la fidélité d’un client',
    description:
      'Désactive (`disabled: true`) ou réactive (`false`) la carte de fidélité ' +
      'd’UN client. Désactivée, la fidélité est gelée pour lui : plus de tampon ' +
      'gagné, plus de récompense proposée ni utilisable. Rien n’est effacé, ' +
      'tampons et récompenses reviennent à la réactivation. Pour couper la ' +
      'fidélité de TOUS les clients, utilise `update_loyalty_settings` ' +
      '(`enabled: false`). Fournis `id` ou `phone`.',
    inputSchema: z
      .object({
        id: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        disabled: z.boolean(),
      })
      .refine((v) => Boolean(v.id) || Boolean(v.phone), {
        message: 'Fournis `id` ou `phone`.',
      }),
    readOnly: false,
    handler: async (args) => {
      const { id, phone, disabled } = args as {
        id?: string;
        phone?: string;
        disabled: boolean;
      };
      let customerId = id;
      if (!customerId) {
        const c = await getCustomerByPhone(phone!);
        if (!c) throw new Error('Client introuvable');
        customerId = c.id;
      }
      const customer = await setCustomerLoyaltyDisabled(customerId, disabled);
      return { customerId, loyaltyDisabled: customer.loyaltyDisabled };
    },
  },
  {
    name: 'get_loyalty_settings',
    toolset: 'crm',
    title: 'Lire les réglages de fidélité',
    description:
      'Renvoie la configuration de la carte à tampons (programme actif — s’il est ' +
      'coupé, la fidélité est gelée pour tous —, montant ' +
      'min, taille de carte, paliers, plafonds, règle 1/jour).',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => getLoyaltySettings(),
  },
  {
    name: 'update_loyalty_settings',
    toolset: 'crm',
    title: 'Modifier les réglages de fidélité',
    description:
      'Met à jour la configuration de la carte à tampons. Le palier ' +
      'intermédiaire (`tier1Stamps`) doit être inférieur à la taille de la ' +
      'carte (`stampsPerCard`). Montants en francs CFA.',
    inputSchema: loyaltySettingsSchema,
    readOnly: false,
    handler: async (args) => {
      await updateLoyaltySettings(args as LoyaltySettings);
      return getLoyaltySettings();
    },
  },
];
