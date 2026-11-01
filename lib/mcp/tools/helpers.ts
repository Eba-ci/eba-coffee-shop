// lib/mcp/tools/helpers.ts
//
// Helpers partagés par les modules d'outils MCP.

import { z } from 'zod';
import { parseDateOnlyToUTC } from '@/lib/timezone';

export const idSchema = z.string().min(1, 'Identifiant requis');

// Plage de dates pour les outils statistiques (jour civil Abidjan, inclusif).
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : YYYY-MM-DD');
export const rangeSchema = z.object({
  from: dateOnly.describe('Date de début (incluse), format YYYY-MM-DD.'),
  to: dateOnly.describe('Date de fin (incluse), format YYYY-MM-DD.'),
});

/** Convertit la plage validée en bornes Date (UTC minuit), from ≤ to. */
export function toRange(args: unknown): { from: Date; to: Date } {
  const { from, to } = args as { from: string; to: string };
  let f = parseDateOnlyToUTC(from)!;
  let t = parseDateOnlyToUTC(to)!;
  if (f.getTime() > t.getTime()) [f, t] = [t, f];
  return { from: f, to: t };
}

/**
 * Résout l'argument image d'un outil `set_*` en une URL réellement stockable
 * et affichable :
 *   • `imageBase64` (+ `mimeType`) → envoyé à Cloudinary ;
 *   • `imageUrl` déjà local (`/uploads/...`) → conservé tel quel ;
 *   • `imageUrl` http(s) → **rapatrié côté serveur** puis envoyé à Cloudinary.
 *
 * Le rapatriement des URLs distantes est indispensable : une URL externe
 * stockée telle quelle ne s'afficherait pas (hôte hors `img-src` de la CSP et
 * hors `images.remotePatterns`). C'est aussi le seul chemin praticable depuis
 * un client de chat, qui ne peut pas ré-encoder une photo en base64.
 */
export async function resolveStoredImageUrl(
  args: { imageBase64?: string; mimeType?: string; imageUrl?: string },
  fromBase64: (input: string, mimeType?: string) => Promise<string>,
  fromUrl: (url: string) => Promise<string>
): Promise<string> {
  const { imageBase64, mimeType, imageUrl } = args;
  if (imageBase64) return fromBase64(imageBase64, mimeType);
  const url = imageUrl!;
  return url.startsWith('/') ? url : fromUrl(url);
}
