// lib/phone-intl.ts
//
// Numéros internationaux (WhatsApp). Séparé de lib/phone.ts, réservé à la caisse et au
// site : un numéro sans `+` ni `00` est supposé ivoirien, jamais converti de 8 à 10 chiffres.

import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** Numéro saisi → E.164 (`+…`), ou `null` s'il n'est pas valide. */
export function toE164(input: string): string | null {
  const number = parsePhoneNumberFromString(input.trim(), 'CI');
  return number?.isValid() ? number.number : null;
}

/** Identifiant de Meta (chiffres avec l'indicatif, sans `+`) → E.164. */
export function waIdToE164(waId: string): string | null {
  return /^\d{6,15}$/.test(waId) ? `+${waId}` : null;
}

/** Mobile ivoirien à 10 chiffres (01, 05, 07) → `+225…`. Refuse 8 chiffres, fixes, étrangers. */
export function normalizeIvorianMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '').replace(/^\+/, '');
  const national = digits.replace(/^(00)?225/, '');
  return /^0[157]\d{8}$/.test(national) ? `+225${national}` : null;
}

export function isIvorianMobile(input: string): boolean {
  return normalizeIvorianMobile(input) !== null;
}
