// app/api/export/customers/route.ts
//
// Export de TOUS les clients vers un répertoire Google (ADMIN, MANAGER,
// ASSISTANT_MANAGER) : `?format=csv` (import contacts.google.com, défaut) ou
// `?format=vcf` (s'ouvre directement sur le téléphone). Indépendant de la page
// affichée, de la recherche et du tri de la liste. Export en masse de données
// personnelles : seuls les rôles qui voient l'identité client des commandes.

import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import { csvResponse } from '@/lib/csv';
import { todayDateString } from '@/lib/timezone';
import {
  buildGoogleContactsCsv,
  buildVCards,
  toContacts,
} from '@/lib/customers/contacts-export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !ROLE_GROUPS.MANAGER_PLUS.includes(session.user.role)) {
    return new Response('Non autorisé', { status: 403 });
  }

  const customers = await prisma.customer.findMany({
    where: { anonymizedAt: null, name: { not: null } },
    select: { name: true, phone: true, anonymizedAt: true },
    orderBy: { name: 'asc' },
  });
  const { contacts, skipped } = toContacts(customers);

  const day = todayDateString();
  const headers = { 'X-Customers-Skipped': String(skipped) };
  if (req.nextUrl.searchParams.get('format') === 'vcf') {
    return new Response(buildVCards(contacts), {
      headers: {
        ...headers,
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="clients-eba_${day}.vcf"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const res = csvResponse(
    `clients-eba_${day}.csv`,
    buildGoogleContactsCsv(contacts)
  );
  res.headers.set('X-Customers-Skipped', headers['X-Customers-Skipped']);
  return res;
}
