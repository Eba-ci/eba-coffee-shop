// app/api/export/customers/ranking/route.ts
//
// « Liste classée » : tous les clients qui ont commandé, du meilleur au moins
// bon, en CSV Excel FR — pour les contacter à la main (invitation à un
// événement…). Export en masse de données personnelles : mêmes rôles que
// l'export Google Contacts (ADMIN, MANAGER, ASSISTANT_MANAGER).

import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import { csvResponse } from '@/lib/csv';
import { todayDateString } from '@/lib/timezone';
import { buildRankingCsv } from '@/lib/customers/ranking-csv';
import { getCustomerRanking } from '@/lib/customers/ranking-query';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session || !ROLE_GROUPS.MANAGER_PLUS.includes(session.user.role)) {
    return new Response('Non autorisé', { status: 403 });
  }
  const rows = await getCustomerRanking();
  return csvResponse(
    `clients-classes_${todayDateString()}.csv`,
    buildRankingCsv(rows)
  );
}
