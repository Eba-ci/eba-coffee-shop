'use client';

import { useEffect, useRef, useState } from 'react';

export type LoyaltyReward = { id: string; tier: number; capAmount: number };
export type LoyaltyCard = {
  stampCount: number;
  stampsPerCard: number;
  minOrderAmount: number;
  /** Récompense débloquée par le prochain tampon (appliquée d'office). */
  nextStampReward: { capAmount: number } | null;
  availableRewards: LoyaltyReward[];
  /** Fidélité gelée : programme coupé ou désactivée pour ce client (rien à proposer). */
  frozen: 'program' | 'customer' | null;
};

const MIN_LOYALTY_PHONE_LENGTH = 8;
const LOYALTY_DEBOUNCE_MS = 400;

/** Carte fidélité du client identifié par téléphone, et récompense choisie (au plus une). */
export function useLoyaltyLookup(customerPhone: string) {
  const [loyaltyCard, setLoyaltyCard] = useState<LoyaltyCard | null>(null);
  const [loyaltyRewardId, setLoyaltyRewardId] = useState<string | null>(null);
  const loyaltyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loyaltyAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (loyaltyTimer.current) clearTimeout(loyaltyTimer.current);
    // Différé (même pour la remise à zéro) : jamais de setState synchrone dans l'effet.
    loyaltyTimer.current = setTimeout(() => {
      const phone = customerPhone.trim();
      if (phone.length < MIN_LOYALTY_PHONE_LENGTH) {
        setLoyaltyCard(null);
        setLoyaltyRewardId(null);
        return;
      }
      loyaltyAbort.current?.abort();
      const controller = new AbortController();
      loyaltyAbort.current = controller;
      fetch(`/api/caisse/loyalty?phone=${encodeURIComponent(phone)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { card: null }))
        .then((data: { card: LoyaltyCard | null }) => {
          setLoyaltyCard(data.card);
          setLoyaltyRewardId((prev) => {
            // Récompense choisie devenue invalide : on la désélectionne.
            if (
              prev &&
              data.card?.availableRewards.some((r) => r.id === prev)
            ) {
              return prev;
            }
            // Sinon, application automatique de la plus ancienne (désélectionnable).
            return data.card?.availableRewards[0]?.id ?? null;
          });
        })
        .catch(() => {
          // Requête annulée ou erreur réseau : pas de carte affichée.
        });
    }, LOYALTY_DEBOUNCE_MS);
  }, [customerPhone]);

  useEffect(() => {
    return () => {
      if (loyaltyTimer.current) clearTimeout(loyaltyTimer.current);
      loyaltyAbort.current?.abort();
    };
  }, []);

  return { loyaltyCard, loyaltyRewardId, setLoyaltyRewardId };
}
