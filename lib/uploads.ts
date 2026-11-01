// Chemins des fichiers historiques de `public/uploads` (lecture seule : route `/uploads` + backfill Cloudinary).
// Plus aucune écriture disque : les nouveaux uploads passent tous par `lib/cloudinary.ts`.

export { uploadsBaseDir } from './uploads/paths';
export type { UploadSubdir } from './uploads/paths';
export { fetchRemoteImage } from './uploads/remote';
