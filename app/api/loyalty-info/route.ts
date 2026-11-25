// app/api/loyalty-info/route.ts
//
// GET /api/loyalty-info — seuil fidélité public pour le checkout.
// GET /api/loyalty-info?phone=07… — ajoute la récompense utilisable du client
// résolu par téléphone (checkout en ligne, sans compte).
// GET /api/loyalty-info?phone=07…&cartTotal=2500 — ajoute aussi `message`, le
// texte incitatif fidélité du récapitulatif de commande (avant paiement) et
// `upcomingReward` ({ capAmount } | null), la réduction que cette commande
// débloquera ; calculés côté serveur (jamais côté client, pour éviter toute
// manipulation). Hors paiement en ligne le serveur l'applique d'office à la
// création ; avec `&online=1` (paiement Jèko) le tampon n'est accordé qu'au
// paiement : le message l'annonce pour la commande SUIVANTE.
//
// N'expose que le strict nécessaire :
//   - sans `phone` : { enabled, minOrderAmount } pour le message "plus que X
//     FCFA pour gagner ton point de fidélité" (/carte/commande) ;
//   - avec `phone` : + { reward: { id, capAmount } | null } — ni nom, ni
//     compteur de tampons (moins que ce que la page de suivi montre déjà à
//     quiconque détient l'URL capability). La consommation est revalidée
//     côté serveur dans la transaction de commande (lib/orders.ts). `message`
//     est un texte résolu (jamais le compteur brut) : même logique
//     d'exposition minimale que `reward`.

import { NextRequest, NextResponse } from 'next/server';
import { getLoyaltySettings } from '@/lib/loyalty-settings-db';
import {
  getAvailableRewardForPhone,
  getLoyaltyCardByPhone,
} from '@/lib/loyalty';
import {
  computeCheckoutLoyaltyMessage,
  computeUpcomingRewardMessage,
} from '@/lib/loyalty-messaging';
import { computeUpcomingReward } from '@/lib/loyalty-compute';
import { todayDailyDate } from '@/lib/daily-numbering';
import { ORDER_CUSTOMER_PHONE_MAX } from '@/config/constants';
import { allowLoyaltyLookup, clientIp } from '@/lib/enumeration-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const settings = await getLoyaltySettings();
    const base = {
      enabled: settings.enabled,
      minOrderAmount: settings.minOrderAmount,
    };

    const phone = req.nextUrl.searchParams.get('phone')?.trim();
    if (!phone) {
      return NextResponse.json(base);
    }
    if (phone.length < 8 || phone.length > ORDER_CUSTOMER_PHONE_MAX) {
      return NextResponse.json({ ...base, reward: null, message: null });
    }
    // Sonde l'existence d'un client par son numéro : freiner l'énumération.
    if (!allowLoyaltyLookup(clientIp(req))) {
      return NextResponse.json(
        { error: 'Trop de requêtes, réessayez dans une minute.' },
        { status: 429 }
      );
    }

    const cartTotalRaw = req.nextUrl.searchParams.get('cartTotal');
    const cartTotal =
      cartTotalRaw !== null && Number.isFinite(Number(cartTotalRaw))
        ? Math.max(0, Math.trunc(Number(cartTotalRaw)))
        : null;

    // Garde-fous spec : programme désactivé ou client non identifiable →
    // aucun message fidélité (jamais de branche affichée sans état réel).
    if (!settings.enabled || cartTotal === null) {
      const reward = settings.enabled
        ? await getAvailableRewardForPhone(phone)
        : null;
      return NextResponse.json({ ...base, reward, message: null });
    }

    const card = await getLoyaltyCardByPhone(phone);
    if (!card) {
      return NextResponse.json({ ...base, reward: null, message: null });
    }

    const reward = card.availableRewards[0]
      ? {
          id: card.availableRewards[0].id,
          capAmount: card.availableRewards[0].capAmount,
        }
      : null;
    // Récompense débloquée par CETTE commande (montant seul). Appliquée d'office
    // à la création sauf en paiement en ligne (`online`), où elle vaut pour la suivante.
    const online = req.nextUrl.searchParams.get('online') === '1';
    const upcomingReward = computeUpcomingReward({
      stampCount: card.stampCount,
      lastStampDate: card.customer.lastStampDate,
      today: todayDailyDate(),
      cartTotal,
      settings,
    });
    const message = upcomingReward
      ? computeUpcomingRewardMessage(upcomingReward.capAmount, { online })
      : computeCheckoutLoyaltyMessage({
          cartTotal,
          stampCount: card.stampCount,
          settings,
        });

    return NextResponse.json({ ...base, reward, upcomingReward, message });
  } catch {
    return NextResponse.json(
      { error: 'Impossible de charger les réglages de fidélité' },
      { status: 500 }
    );
  }
}
