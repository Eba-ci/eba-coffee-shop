// lib/loyalty.ts
//
// Lecture de la carte de fidélité d'un client (avancement + récompenses dispo).

import prisma from '@/lib/prisma';
import { customerPhoneKey } from '@/lib/phone';
import { getLoyaltySettings } from '@/lib/loyalty-settings-db';
import { loyaltyFreezeReason } from '@/lib/loyalty/active';

export async function getLoyaltyCard(customerId: string) {
  const [settings, customer, availableRewards] = await Promise.all([
    getLoyaltySettings(),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        stampCount: true,
        lastStampDate: true,
        loyaltyDisabled: true,
      },
    }),
    prisma.loyaltyReward.findMany({
      where: { customerId, status: 'AVAILABLE' },
      orderBy: { earnedAt: 'asc' },
    }),
  ]);
  if (!customer) return null;

  // Gel (programme OU client désactivé) : `availableRewards` reste lisible tel
  // quel (la fiche client montre ce qui est mis de côté), mais TOUT consommateur
  // qui propose, affiche ou applique doit tester `active` — jamais `settings.enabled`
  // seul, qui ignorerait le drapeau du client.
  const frozenReason = loyaltyFreezeReason(settings, customer);

  return {
    customer,
    settings,
    stampCount: customer.stampCount,
    availableRewards,
    active: frozenReason === null,
    frozenReason,
  };
}

export async function getLoyaltyCardByPhone(rawPhone: string) {
  const key = customerPhoneKey(rawPhone);
  if (!key) return null;
  const customer = await prisma.customer.findUnique({
    where: { phone: key },
    select: { id: true },
  });
  return customer ? getLoyaltyCard(customer.id) : null;
}

/**
 * Récompense utilisable pour un téléphone (checkout en ligne, sans compte) :
 * la plus ancienne `AVAILABLE` du client résolu par téléphone, ou `null`
 * (fidélité gelée — programme ou client désactivé —, client inconnu, rien à utiliser).
 *
 * Exposition volontairement MINIMALE (id + plafond) : ni nom, ni compteur de
 * tampons — moins que ce que la page de suivi montre déjà à quiconque détient
 * l'URL. La consommation reste validée côté serveur dans la transaction de
 * commande (`resolveLoyaltyReward`), contre le client résolu du MÊME téléphone
 * que la commande.
 */
/**
 * Issue fidélité d'une commande DÉJÀ traitée (paiement/statut passés) : cette
 * commande a-t-elle crédité un tampon, était-ce le tout premier du client, et
 * quel est son compteur de tampons APRÈS cet ajout. Sert la messagerie
 * « commande prête » (confirmation), distincte de la messagerie
 * pré-paiement (`computeCheckoutLoyaltyMessage`, incitative).
 *
 * Le tampon (s'il y en a eu un) a été attribué à la création de la commande
 * (`awardLoyaltyForOrder`, MÊME transaction) — cette fonction ne fait que
 * relire ce qui a déjà été tracé au ledger, jamais de nouvelle attribution.
 */
export async function getOrderLoyaltyOutcome(
  customerId: string,
  orderId: string
): Promise<{
  stampCount: number;
  stampEarned: boolean;
  isFirstStampEver: boolean;
} | null> {
  const [customer, stampLedgerForOrder, totalStampEntries] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { stampCount: true, loyaltyDisabled: true },
    }),
    prisma.loyaltyLedger.findFirst({
      where: { customerId, orderId, type: 'STAMP_EARNED' },
      select: { id: true },
    }),
    prisma.loyaltyLedger.count({
      where: { customerId, type: 'STAMP_EARNED' },
    }),
  ]);
  // Client désactivé : aucun message « tampon » (le gel prime sur ce qu'il avait gagné).
  if (!customer || customer.loyaltyDisabled) return null;

  const stampEarned = stampLedgerForOrder !== null;
  return {
    stampCount: customer.stampCount,
    stampEarned,
    isFirstStampEver: stampEarned && totalStampEntries === 1,
  };
}

export async function getAvailableRewardForPhone(
  rawPhone: string
): Promise<{ id: string; capAmount: number } | null> {
  const card = await getLoyaltyCardByPhone(rawPhone);
  if (!card || !card.active) return null;
  const reward = card.availableRewards[0];
  return reward ? { id: reward.id, capAmount: reward.capAmount } : null;
}
