import { join } from 'node:path';

/** Sous-dossiers d'upload autorisés (whitelist — pas de chemin arbitraire). */
export type UploadSubdir =
  | 'products'
  | 'receipts'
  // Historique : plus rien n'y écrit, mais le backfill Cloudinary rapatrie encore les
  // anciennes captures de paiement (prisma/backfill-cloudinary-uploads.ts).
  | 'payment-proofs'
  | 'poll-options'
  | 'polls'
  | 'menu-pdf'
  | 'tiktok';

/** Racine disque des fichiers historiques (lecture seule) : `<cwd>/public/uploads`. */
export function uploadsBaseDir(): string {
  return join(process.cwd(), 'public', 'uploads');
}
