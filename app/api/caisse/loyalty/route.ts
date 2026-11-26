// app/api/caisse/loyalty/route.ts
//
// GET /api/caisse/loyalty?phone=...
// Carte de fidélité d'un client (par téléphone), pour la caisse : avancement
// (tampons) + récompenses disponibles à proposer au client AVANT de valider la
// commande (bouton « Appliquer -X F » dans l'écran Nouvelle commande).
//
// Réutilise `getLoyaltyCardByPhone` (lib/loyalty.ts) — même source que la
// fiche client CRM et l'outil MCP `get_loyalty_card`.

import { NextResponse } from 'next/server';
import { requireCashier } from '@/lib/auth-helpers';
import { getLoyaltyCardByPhone } from '@/lib/loyalty';
import { computeUpcomingReward } from '@/lib/loyalty-compute';
import { todayDailyDate } from '@/lib/daily-numbering';

export async function GET(req: Request) {
  try {
    await requireCashier();
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const phone = new URL(req.url).searchParams.get('phone')?.trim() ?? '';
  if (!phone) {
    return NextResponse.json({ card: null });
  }

  try {
    const card = await getLoyaltyCardByPhone(phone);
    if (!card) {
      return NextResponse.json({ card: null });
    }
    // Fidélité gelée (programme ou client désactivé) : la caisse ne propose ni
    // récompense ni réduction à venir (le serveur refuserait de toute façon).
    // `frozen` laisse l'écran dire pourquoi plutôt que de montrer une carte vide.
    if (!card.active) {
      return NextResponse.json({
        card: {
          stampCount: card.stampCount,
          stampsPerCard: card.settings.stampsPerCard,
          minOrderAmount: card.settings.minOrderAmount,
          nextStampReward: null,
          availableRewards: [],
          frozen: card.frozenReason,
        },
      });
    }
    // Récompense que le PROCHAIN tampon débloquera (appliquée d'office par le
    // serveur à la création) : la caisse l'annonce dans le panier, le test du
    // montant minimum se fait côté client sur le total courant.
    const nextStampReward = computeUpcomingReward({
      stampCount: card.stampCount,
      lastStampDate: card.customer.lastStampDate,
      today: todayDailyDate(),
      cartTotal: card.settings.minOrderAmount,
      settings: card.settings,
    });
    return NextResponse.json({
      card: {
        stampCount: card.stampCount,
        stampsPerCard: card.settings.stampsPerCard,
        minOrderAmount: card.settings.minOrderAmount,
        nextStampReward,
        frozen: null,
        availableRewards: card.availableRewards.map((r) => ({
          id: r.id,
          tier: r.tier,
          capAmount: r.capAmount,
        })),
      },
    });
  } catch (err) {
    console.error('[GET /api/caisse/loyalty]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
