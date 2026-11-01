// app/api/internal/revalidate/route.ts
//
// POST /api/internal/revalidate — réchauffage d'un déploiement. L'image Docker est
// construite sur une base vide : les ~24 pages prérendues contiennent les valeurs
// par défaut des réglages (coordonnées, horaires), et celles sans `revalidate`
// (/cgv, /contact, /a-propos…) ne se régénèrent jamais seules. `deploy/deploy.sh`
// appelle cette route sur la NOUVELLE couleur avant la bascule : tout l'arbre est
// invalidé, puis chaque page renvoyée est requêtée pour être régénérée avec la vraie
// base. Même garde que les crons : secret bearer (CRON_SECRET), route inerte (404)
// s'il n'est pas configuré.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Fichiers générés (icônes, manifest) : rien à régénérer depuis la base. */
const STATIC_FILE = /\.(png|ico|svg|jpe?g|webp|json)$/;

/**
 * Pages prérendues au build, lues dans le manifeste de Next : aucune liste à tenir
 * à jour quand une page est ajoutée. Vide si le manifeste est absent (next dev).
 */
export async function prerenderedPaths(): Promise<string[]> {
  try {
    const raw = await readFile(
      join(process.cwd(), '.next', 'prerender-manifest.json'),
      'utf8'
    );
    const { routes } = JSON.parse(raw) as { routes: Record<string, unknown> };
    return Object.keys(routes)
      .filter((path) => !path.startsWith('/_') && !STATIC_FILE.test(path))
      .sort();
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('Non configuré', { status: 404 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Non autorisé', { status: 401 });
  }
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, paths: await prerenderedPaths() });
}
