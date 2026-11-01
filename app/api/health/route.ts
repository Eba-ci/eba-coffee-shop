// app/api/health/route.ts
//
// GET /api/health — sonde de disponibilité du déploiement blue/green : la bascule
// n'a lieu qu'une fois ce point à 200. Vérifie la base (seule dépendance sans
// laquelle le site ne sert à rien) ; léger, jamais mis en cache.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }
}
