// lib/whatsapp/mask-phone.ts
//
// Le modèle ne voit jamais de numéro : chaque numéro d'un message devient `[NUMÉRO_n]`.
// La correspondance (`ContactRefs`) vit avec la conversation, jamais d'une conversation à l'autre.

import { findPhoneNumbersInText } from 'libphonenumber-js/max';
import { toE164 } from '@/lib/phone-intl';

/** `NUMÉRO_1` → `+2250707070707` (ou `raw:<chiffres>` si le numéro n'est pas valide). */
export type ContactRefs = Record<string, string>;

type Match = { start: number; end: number; value: string };

// Suites de 9 chiffres ou plus (séparateurs permis) : pas les dates ni les montants courants.
const LONG_DIGITS = /\+\d[\d\s().-]{6,}\d|\d(?:[\s.-]?\d){8,}/g;
const PLACEHOLDER = /\[NUMÉRO_(\d+)\]/g;
const REF_NAME = /^\[?\s*NUM[ÉE]RO_(\d+)\s*\]?$/i;

function detect(text: string): Match[] {
  const found: Match[] = findPhoneNumbersInText(text, 'CI').map((m) => ({
    start: m.startsAt,
    end: m.endsAt,
    value: m.number.number,
  }));
  for (const m of text.matchAll(LONG_DIGITS)) {
    const start = m.index;
    const end = start + m[0].length;
    if (found.some((f) => start < f.end && end > f.start)) continue;
    const value = toE164(m[0]) ?? `raw:${m[0].replace(/\D/g, '')}`;
    found.push({ start, end, value });
  }
  return found.sort((a, b) => a.start - b.start);
}

function refFor(value: string, refs: ContactRefs): string {
  const existing = Object.entries(refs).find(([, v]) => v === value);
  if (existing) return existing[0];
  const indexes = Object.keys(refs).map((key) => Number(key.split('_')[1]));
  const key = `NUMÉRO_${Math.max(0, ...indexes) + 1}`;
  refs[key] = value;
  return key;
}

/** Remplace chaque numéro par son repère ; renvoie le texte et la correspondance mise à jour. */
export function maskPhoneNumbers(
  text: string,
  known: ContactRefs = {}
): { text: string; refs: ContactRefs } {
  const refs = { ...known };
  const matches = detect(text);
  const keys = matches.map((m) => refFor(m.value, refs));
  let masked = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    masked = `${masked.slice(0, matches[i].start)}[${keys[i]}]${masked.slice(matches[i].end)}`;
  }
  return { text: masked, refs };
}

/** Vrai si le texte contient encore un numéro : garde-fou avant d'envoyer une réponse du modèle. */
export function containsPhoneNumber(text: string): boolean {
  return detect(text.replace(PLACEHOLDER, ' ')).length > 0;
}

/** `[NUMÉRO_1]`, `NUMÉRO_1` ou `numero_1` → le numéro enregistré, ou `null`. */
export function resolveContactRef(
  ref: string,
  refs: ContactRefs
): string | null {
  const match = REF_NAME.exec(ref.trim());
  const value = match ? refs[`NUMÉRO_${match[1]}`] : undefined;
  return value?.replace(/^raw:/, '') ?? null;
}

/** Remet les vrais numéros à la place des repères (texte fabriqué par le serveur). */
export function restoreNumbers(text: string, refs: ContactRefs): string {
  return text.replace(PLACEHOLDER, (whole, index: string) => {
    const value = refs[`NUMÉRO_${index}`];
    return value ? value.replace(/^raw:/, '') : whole;
  });
}
