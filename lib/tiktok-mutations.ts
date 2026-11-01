// lib/tiktok-mutations.ts
//
// Écriture pour les vidéos TikTok embarquées (section "Suivez l'aventure" de
// l'accueil). Lecture dans lib/tiktok.ts.

import prisma from '@/lib/prisma';
import {
  tiktokVideoInputSchema,
  tiktokVideoUpdateSchema,
  extractTiktokVideoId,
} from '@/lib/schemas/tiktok';
import { fetchTiktokOEmbed } from '@/lib/tiktok-oembed';
import { uploadTiktokThumbnail } from '@/lib/cloudinary';

type OEmbedFields = {
  oembedTitle: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
};

const NO_OEMBED_FIELDS: OEmbedFields = {
  oembedTitle: null,
  authorName: null,
  thumbnailUrl: null,
};

/**
 * Enrichissement best-effort d'une vidéo à partir de l'oEmbed public de
 * TikTok : ne doit jamais faire échouer la création/mise à jour appelante,
 * y compris si le téléchargement de la miniature échoue une fois l'oEmbed
 * obtenu (URL expirée, hôte injoignable...).
 */
async function enrichFromOEmbed(url: string): Promise<OEmbedFields> {
  const oembed = await fetchTiktokOEmbed(url);
  if (!oembed) return NO_OEMBED_FIELDS;

  let thumbnailUrl: string | null = null;
  if (oembed.thumbnailUrl) {
    try {
      thumbnailUrl = await uploadTiktokThumbnail(oembed.thumbnailUrl);
    } catch {
      thumbnailUrl = null;
    }
  }

  return {
    oembedTitle: oembed.title,
    authorName: oembed.authorName,
    thumbnailUrl,
  };
}

export async function createTiktokVideo(input: unknown, createdById?: string) {
  const data = tiktokVideoInputSchema.parse(input);
  const videoId = extractTiktokVideoId(data.url);
  if (!videoId) throw new Error('URL TikTok invalide');

  const [existing, oembedFields] = await Promise.all([
    prisma.tiktokVideo.findMany({
      where: { deletedAt: null },
      select: { id: true },
    }),
    enrichFromOEmbed(data.url),
  ]);

  return prisma.tiktokVideo.create({
    data: {
      url: data.url,
      videoId,
      caption: data.caption ?? null,
      isActive: data.isActive,
      sortOrder: existing.length,
      createdById: createdById ?? null,
      ...oembedFields,
    },
  });
}

export async function updateTiktokVideo(id: string, input: unknown) {
  const data = tiktokVideoUpdateSchema.parse(input);
  const existing = await prisma.tiktokVideo.findUnique({ where: { id } });
  if (!existing) throw new Error('Vidéo introuvable');

  let videoId: string | undefined;
  let oembedFields: OEmbedFields | undefined;
  if (data.url !== undefined) {
    const extracted = extractTiktokVideoId(data.url);
    if (!extracted) throw new Error('URL TikTok invalide');
    videoId = extracted;
    // L'URL change : les métadonnées auto-détectées précédentes ne
    // correspondent plus à la nouvelle vidéo — on les rafraîchit (ou on les
    // vide si l'oEmbed échoue, plutôt que de garder des données périmées).
    oembedFields = await enrichFromOEmbed(data.url);
  }

  return prisma.tiktokVideo.update({
    where: { id },
    data: {
      ...(data.url !== undefined && {
        url: data.url,
        videoId,
        ...oembedFields,
      }),
      ...(data.caption !== undefined && { caption: data.caption }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

// Soft delete pour rester cohérent avec PollOption (traçabilité).
export async function deleteTiktokVideo(id: string) {
  const existing = await prisma.tiktokVideo.findUnique({ where: { id } });
  if (!existing) throw new Error('Vidéo introuvable');
  return prisma.tiktokVideo.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// Réordonne une vidéo d'un cran (haut/bas). Copie de `movePollOption`
// (lib/poll-mutations.ts), sans scope parent (liste plate).
export async function moveTiktokVideo(id: string, direction: 'up' | 'down') {
  const all = await prisma.tiktokVideo.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });
  const idx = all.findIndex((v) => v.id === id);
  if (idx === -1) throw new Error('Vidéo introuvable');

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;

  const a = all[idx];
  const b = all[swapIdx];
  await prisma.tiktokVideo.update({
    where: { id: a.id },
    data: { sortOrder: b.sortOrder },
  });
  await prisma.tiktokVideo.update({
    where: { id: b.id },
    data: { sortOrder: a.sortOrder },
  });
}
