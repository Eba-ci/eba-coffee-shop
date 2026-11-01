// lib/cloudinary.ts
//
// Intégration Cloudinary : upload direct navigateur → Cloudinary via
// paramètres signés (le secret API ne quitte jamais le serveur), et upload
// serveur pour les flux MCP (base64/URL distante) où l'appelant n'est pas un
// navigateur.
//
// Le redimensionnement/ré-encodage fait aujourd'hui par `sharp` sur le
// pipeline local (lib/uploads.ts, conservé en repli lecture seule) est ici
// repris par les paramètres de transformation Cloudinary appliqués à
// l'upload — on n'insère PAS sharp entre le navigateur et Cloudinary, ce qui
// recréerait le passage par notre serveur qu'on cherche justement à éliminer.

import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { IMAGE_MAX_DIMENSION } from '@/config/constants';
import { normalizeToDataUri } from '@/lib/schemas/upload';
import { fetchRemoteImage, type UploadSubdir } from '@/lib/uploads';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Formats bruts acceptés par Cloudinary (mapping de `ALLOWED_IMAGE_MIME_TYPES`). */
const ALLOWED_FORMATS = ['jpg', 'png', 'webp', 'avif', 'heic', 'heif'];

/**
 * Transformation appliquée à l'upload : équivalent du pipeline sharp actuel
 * (redimensionnement « à l'intérieur », sans agrandir) + format/qualité
 * négociés automatiquement par Cloudinary selon le client appelant.
 */
const UPLOAD_TRANSFORMATION = [
  { crop: 'limit', width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION },
  { fetch_format: 'auto', quality: 'auto' },
] as const;

/** Chaîne de transformation équivalente, au format URL Cloudinary (signature/upload direct navigateur). */
const UPLOAD_TRANSFORMATION_STRING = `c_limit,w_${IMAGE_MAX_DIMENSION},h_${IMAGE_MAX_DIMENSION},f_auto,q_auto`;

function folderPrefix(): string {
  return process.env.CLOUDINARY_FOLDER_PREFIX || 'eba-coffee-shop-dev';
}

/** Dossier Cloudinary cible pour une famille d'upload donnée. */
export function cloudinaryFolder(subdir: UploadSubdir): string {
  return `${folderPrefix()}/${subdir}`;
}

export type SignedUploadParams = {
  timestamp: number;
  folder: string;
  transformation: string;
  allowed_formats: string;
  signature: string;
  api_key: string;
  cloud_name: string;
};

/** Formats de document acceptés pour la carte PDF (subdir `menu-pdf`). */
const ALLOWED_DOCUMENT_FORMATS = ['pdf'];

export type SignedRawUploadParams = {
  timestamp: number;
  folder: string;
  allowed_formats: string;
  signature: string;
  api_key: string;
  cloud_name: string;
  resource_type: 'raw';
};

/**
 * Calcule les paramètres d'upload signés pour un `subdir` donné : le
 * navigateur les reçoit puis poste directement le fichier à
 * `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload` (jamais via
 * notre serveur). Chaque champ non-`file`/`api_key`/`signature` envoyé par le
 * client DOIT correspondre exactement à ce qui a été signé ici.
 */
export function buildSignedUploadParams(
  subdir: UploadSubdir
): SignedUploadParams {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error(
      'Cloudinary non configuré (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / ' +
        'NEXT_PUBLIC_CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET manquants)'
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = cloudinaryFolder(subdir);
  const transformation = UPLOAD_TRANSFORMATION_STRING;
  const allowedFormats = ALLOWED_FORMATS.join(',');

  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
      transformation,
      allowed_formats: allowedFormats,
    },
    apiSecret
  );

  return {
    timestamp,
    folder,
    transformation,
    allowed_formats: allowedFormats,
    signature,
    api_key: apiKey,
    cloud_name: cloudName,
  };
}

/**
 * Calcule les paramètres d'upload signés pour la carte PDF (subdir figé
 * `menu-pdf`, `resource_type: 'raw'`) : pas de `transformation` (réservée aux
 * images), le fichier est stocké tel quel. Même principe que
 * `buildSignedUploadParams` — le navigateur poste directement à
 * `https://api.cloudinary.com/v1_1/<cloud_name>/raw/upload`.
 */
export function buildMenuPdfSignedUploadParams(): SignedRawUploadParams {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error(
      'Cloudinary non configuré (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / ' +
        'NEXT_PUBLIC_CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET manquants)'
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = cloudinaryFolder('menu-pdf');
  const allowedFormats = ALLOWED_DOCUMENT_FORMATS.join(',');

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats },
    apiSecret
  );

  return {
    timestamp,
    folder,
    allowed_formats: allowedFormats,
    signature,
    api_key: apiKey,
    cloud_name: cloudName,
    resource_type: 'raw',
  };
}

/**
 * Uploade une image côté serveur vers Cloudinary — `source` peut être une
 * data URI (`data:<mime>;base64,...`) ou une URL http(s) distante (Cloudinary
 * la rapatrie lui-même, pas besoin de la télécharger nous-mêmes).
 */
export async function uploadImageToCloudinary(
  source: string,
  subdir: UploadSubdir
): Promise<string> {
  const result = await cloudinary.uploader.upload(source, {
    folder: cloudinaryFolder(subdir),
    transformation: [...UPLOAD_TRANSFORMATION],
    allowed_formats: ALLOWED_FORMATS,
    resource_type: 'image',
  });
  return result.secure_url;
}

/**
 * Uploade un buffer (fichier lu depuis le disque) vers Cloudinary — pensé
 * pour le script de backfill (`prisma/backfill-cloudinary-uploads.ts`), qui
 * migre les fichiers déjà stockés localement.
 */
export function uploadBufferToCloudinary(
  buffer: Buffer,
  subdir: UploadSubdir
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: cloudinaryFolder(subdir),
        transformation: [...UPLOAD_TRANSFORMATION],
        allowed_formats: ALLOWED_FORMATS,
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Échec upload Cloudinary'));
          return;
        }
        resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Résout un `source` MCP (base64 brut, data URI, ou URL http(s) distante) et
 * l'uploade vers Cloudinary dans `subdir`. Assignable directement aux deux
 * callbacks (`fromBase64`/`fromUrl`) attendues par `resolveStoredImageUrl`
 * (`lib/mcp/tools.ts`) : appelée avec `(input, mimeType)` pour le base64,
 * `mimeType` est simplement ignoré quand `source` est déjà une URL.
 */
function uploadToCloudinary(
  source: string,
  subdir: UploadSubdir,
  mimeType?: string
): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    return uploadImageToCloudinary(source, subdir);
  }
  return uploadImageToCloudinary(normalizeToDataUri(source, mimeType), subdir);
}

// ─── Wrappers par famille (subdir figé), pour les outils MCP ─────────────────

export const uploadProductImage = (source: string, mimeType?: string) =>
  uploadToCloudinary(source, 'products', mimeType);

export const uploadReceiptImage = (source: string, mimeType?: string) =>
  uploadToCloudinary(source, 'receipts', mimeType);

export const uploadPollImage = (source: string, mimeType?: string) =>
  uploadToCloudinary(source, 'polls', mimeType);

export const uploadPollOptionImage = (source: string, mimeType?: string) =>
  uploadToCloudinary(source, 'poll-options', mimeType);

/**
 * Miniature TikTok : téléchargée côté serveur (taille et délai bornés) puis
 * envoyée à Cloudinary, pour ne pas dépendre d'une URL CDN TikTok qui expire.
 */
export async function uploadTiktokThumbnail(url: string): Promise<string> {
  return uploadBufferToCloudinary(await fetchRemoteImage(url), 'tiktok');
}

/**
 * Supprime un asset Cloudinary à partir de son URL de livraison. Non branchée
 * à un call-site pour l'instant : le nettoyage d'images orphelines
 * (remplacement/suppression d'un produit, d'une dépense, etc.) est un gap
 * préexistant du pipeline local (aucune image locale n'est jamais supprimée
 * non plus), hors périmètre de cette migration.
 */
export async function deleteFromCloudinary(url: string): Promise<void> {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  if (!match) return;
  await cloudinary.uploader.destroy(match[1], { resource_type: 'image' });
}
