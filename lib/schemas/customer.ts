// lib/schemas/customer.ts
//
// Schémas Zod centralisés pour le CRM (création / modification d'un client).
// Le client est identifié par son téléphone (clé canonique normalisée côté
// mutation via `customerPhoneKey`). Conformément à CLAUDE.md : pas de
// redéclaration inline ailleurs.

import { z } from 'zod';
import {
  CUSTOMER_TRUSTED_NOTE_MAX,
  ORDER_CUSTOMER_NAME_MAX,
  ORDER_CUSTOMER_PHONE_MAX,
} from '@/config/constants';

const nameField = z
  .string()
  .trim()
  .max(ORDER_CUSTOMER_NAME_MAX, 'Nom trop long')
  .nullable()
  .optional();

const phoneField = z
  .string()
  .trim()
  .min(1, 'Téléphone requis')
  .max(ORDER_CUSTOMER_PHONE_MAX, 'Téléphone trop long');

// Date de naissance : chaîne `AAAA-MM-JJ` (format natif `<input type="date">`),
// ou null pour l'effacer. Aucune validation de plausibilité (âge min/max) :
// c'est une note libre saisie par le staff, pas une donnée vérifiée.
const dateOfBirthField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ)')
  .nullable()
  .optional();

export const customerInputSchema = z.object({
  name: nameField,
  // Téléphone obligatoire à la création : c'est l'identité du client.
  phone: phoneField,
  dateOfBirth: dateOfBirthField,
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

// Mise à jour partielle : nom, téléphone et/ou date de naissance.
export const customerUpdateSchema = z
  .object({
    name: nameField,
    phone: phoneField.optional(),
    dateOfBirth: dateOfBirthField,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.dateOfBirth !== undefined,
    { message: 'Au moins un champ à mettre à jour est requis' }
  );

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

// Fusion de deux comptes clients (doublon) : `sourceId` est absorbé par
// `targetId` (jamais l'inverse) — la source est supprimée après fusion.
export const customerMergeSchema = z
  .object({
    sourceId: z.string().min(1, 'Client source requis'),
    targetId: z.string().min(1, 'Client cible requis'),
  })
  .refine((v) => v.sourceId !== v.targetId, {
    message: 'Impossible de fusionner un client avec lui-même',
    path: ['targetId'],
  });

export type CustomerMergeInput = z.infer<typeof customerMergeSchema>;

// « Client de confiance » : ses commandes saisies en caisse partent en cuisine
// SANS encaissement préalable (ardoise, cf. `Order.isOnAccount`). Surface
// dédiée et non un champ de `customerUpdateSchema` : c'est une décision
// financière, réservée à MANAGER_PLUS, pas une simple correction de fiche.
// `note` = motif ou plafond convenu (facultatif, ignoré quand on retire la
// confiance — cf. `setCustomerTrusted`).
export const setCustomerTrustedSchema = z.object({
  isTrusted: z.boolean(),
  note: z
    .string()
    .trim()
    .max(CUSTOMER_TRUSTED_NOTE_MAX, 'Motif trop long')
    .nullable()
    .optional(),
});

export type SetCustomerTrustedInput = z.infer<typeof setCustomerTrustedSchema>;

// Fidélité désactivée pour UN client : gel du gain, de l'affichage et de l'usage
// des récompenses (cf. `lib/loyalty/active.ts`). Surface dédiée, comme la
// confiance : ce n'est pas une correction de fiche.
export const setCustomerLoyaltyDisabledSchema = z.object({
  loyaltyDisabled: z.boolean(),
});

export type SetCustomerLoyaltyDisabledInput = z.infer<
  typeof setCustomerLoyaltyDisabledSchema
>;
