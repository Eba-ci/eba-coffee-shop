'use client';

// lib/hooks/use-loyalty-teaser.ts
//
// Message fidélité incitatif du récapitulatif de commande (avant paiement),
// pour le téléphone ET le total net saisis au checkout
// (GET /api/loyalty-info?phone=…&cartTotal=…, débouncé). Calculé côté
// serveur : le compteur de tampons n'est jamais exposé au client (cf.
// app/api/loyalty-info/route.ts). `null` = rien à afficher (programme
// désactivé, téléphone pas encore identifiable, ou erreur réseau).
// `upcomingReward` = réduction que CETTE commande débloquera. Hors paiement en
// ligne le serveur l'applique d'office à la création et le récapitulatif la
// déduit d'avance ; en paiement en ligne (`online`) elle vaut pour la commande
// suivante : le message le dit et le récapitulatif ne la déduit pas
// (cf. `lib/loyalty-checkout.ts`).

import { useEffect, useState } from 'react';
import { ORDER_CUSTOMER_PHONE_MAX } from '@/config/constants';

const DEBOUNCE_MS = 500;

export type LoyaltyTeaser = {
  message: string | null;
  upcomingReward: { capAmount: number } | null;
};

const EMPTY: LoyaltyTeaser = { message: null, upcomingReward: null };

export function useLoyaltyTeaser(
  phone: string,
  cartTotal: number,
  opts: { online?: boolean } = {}
): LoyaltyTeaser {
  const online = opts.online ?? false;
  const [teaser, setTeaser] = useState<LoyaltyTeaser>(EMPTY);

  useEffect(() => {
    const trimmed = phone.trim();
    const valid =
      trimmed.length >= 8 && trimmed.length <= ORDER_CUSTOMER_PHONE_MAX;
    let cancelled = false;

    const timer = setTimeout(
      () => {
        if (cancelled) return;
        if (!valid) {
          setTeaser(EMPTY);
          return;
        }
        const params = new URLSearchParams({
          phone: trimmed,
          cartTotal: String(Math.max(0, Math.trunc(cartTotal))),
        });
        if (online) params.set('online', '1');
        fetch(`/api/loyalty-info?${params.toString()}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then(
            (data: {
              message?: string | null;
              upcomingReward?: { capAmount: number } | null;
            }) => {
              if (cancelled) return;
              setTeaser({
                message: data.message ?? null,
                upcomingReward: data.upcomingReward ?? null,
              });
            }
          )
          .catch(() => {
            if (!cancelled) setTeaser(EMPTY);
          });
      },
      // Reset immédiat quand le numéro redevient invalide (champ vidé).
      valid ? DEBOUNCE_MS : 0
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, cartTotal, online]);

  return teaser;
}
