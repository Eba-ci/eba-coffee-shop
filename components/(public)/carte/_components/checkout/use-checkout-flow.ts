'use client';

import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '@/lib/cart-store';
import { cartItemToAnalyticsItem, trackRemoveFromCart } from '@/lib/analytics';
import { effectiveItemAdvanceDays } from '@/lib/supplements';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import { useCheckoutForm } from '@/lib/hooks/use-checkout-form';
import { usePickupInfo } from '@/lib/hooks/use-pickup-info';
import { useLoyaltyReward } from '@/lib/hooks/use-loyalty-reward';
import { useLoyaltyTeaser } from '@/lib/hooks/use-loyalty-teaser';
import { useCreditOffer } from '@/lib/hooks/use-credit-offer';
import { withOnlineFee } from '@/lib/online-fee';
import { checkoutLoyaltyDiscounts } from '@/lib/loyalty-checkout';
import { usePrecommandeMode } from '../use-precommande-mode';
import type { CheckoutFormProps } from './types';

export function useCheckoutFlow({
  items,
  total,
  onSuccess,
  onLoyaltyDiscountChange,
  onCreditChange,
  onlinePayment,
  availability,
}: CheckoutFormProps) {
  // Récompense appliquée par défaut (frictionless) ; le client peut la garder
  // pour une prochaine commande via le Switch du bandeau.
  const [rewardApplied, setRewardApplied] = useState(true);
  // Avoir : même principe, appliqué par défaut tant que le client ne le garde pas.
  const [creditApplied, setCreditApplied] = useState(true);

  const {
    values,
    errors,
    isSubmitting,
    setField,
    submit,
    soldOutLines,
    showSoldOutLines,
    clearSoldOutLines,
  } = useCheckoutForm({
    items,
    total,
    paymentRequired: onlinePayment.status === 'ready' && onlinePayment.enabled,
  });
  const replaceItem = useCartStore((s) => s.replaceItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const patchItems = useCartStore((s) => s.patchItems);
  const slotRef = useRef<HTMLDivElement>(null);
  const contactFieldsRef = useRef<HTMLDivElement>(null);
  const submitErrorRef = useRef<HTMLParagraphElement>(null);
  // Plus grand délai de commande à l'avance requis par le panier (voir
  // `CartItem.advanceOrderDays`, lib/cart-store.ts) : étend l'horizon de
  // créneaux et contraint le sélecteur (voir SlotPicker).
  //
  // `effectiveItemAdvanceDays` intègre aussi les articles ÉPUISÉS AUJOURD'HUI
  // (J+1 minimum) : un seul mécanisme de contrainte de jour, pas deux.
  const minAdvanceOrderDays = items.reduce(
    (max, i) => Math.max(max, effectiveItemAdvanceDays(i)),
    0
  );
  const { soldOutRestricted, precommandePure } = usePrecommandeMode(
    items,
    minAdvanceOrderDays,
    setField
  );
  const pickupInfo = usePickupInfo(minAdvanceOrderDays);
  // Recherche débouncée de la récompense du numéro saisi.
  const reward = useLoyaltyReward(values.customerPhone);

  const activeReward =
    reward.status === 'ready' && rewardApplied ? reward : null;
  // Paiement en ligne : montant réellement débité = total net − avoir + frais.
  const payOnline = onlinePayment.status === 'ready' && onlinePayment.enabled;
  // Récompense acquise : remise toujours appliquée par le serveur.
  const rewardDiscount = activeReward
    ? Math.min(activeReward.capAmount, total)
    : 0;
  // Le serveur n'applique d'office la réduction de la commande en cours que hors
  // paiement en ligne. Tant que la config de paiement charge (ou échoue), on ne
  // sait pas : on ne la déduit pas et le message l'annonce pour la suivante.
  const deductUpcoming =
    onlinePayment.status === 'ready' && !onlinePayment.enabled;
  // Total net de la récompense déjà acquise : c'est lui que `awardLoyaltyForOrder`
  // teste pour créditer un tampon. Le message incitatif et l'aperçu de la
  // réduction à venir se calculent donc dessus, dans un second appel débouncé
  // distinct de la recherche de récompense ci-dessus (celle-ci ne dépend pas du
  // total, la boucler dessus créerait une dépendance circulaire
  // reward → discount → netTotal → reward).
  const { message: loyaltyMessage, upcomingReward } = useLoyaltyTeaser(
    values.customerPhone,
    total - rewardDiscount,
    { online: !deductUpcoming }
  );
  // Réduction débloquée par cette commande : hors paiement en ligne, le serveur
  // l'applique d'office à la création, on la déduit donc d'avance pour que le
  // récapitulatif corresponde au montant réel. EN LIGNE, le tampon n'est accordé
  // qu'au paiement et Jèko débite le total sans elle : elle vaut pour la commande
  // suivante, jamais déduite ici.
  const { discount, netTotal } = checkoutLoyaltyDiscounts({
    total,
    activeRewardCap: activeReward?.capAmount ?? null,
    upcomingCap: upcomingReward?.capAmount ?? null,
    deductUpcoming,
  });
  // L'avoir n'existe que pour un paiement en ligne (il réduit ce que Jèko encaisse).
  const creditOffer = useCreditOffer(values.customerPhone, netTotal, payOnline);
  const useCredit = creditOffer.status === 'ready' && creditApplied;
  const creditDiscount =
    creditOffer.status === 'ready' && useCredit ? creditOffer.applicable : 0;
  const { amountDue } = withOnlineFee(
    netTotal - creditDiscount,
    onlinePayment.status === 'ready' ? onlinePayment.feePercent : 0
  );

  // Remonte les remises au récapitulatif de la page (au-dessus du formulaire).
  useEffect(() => {
    onLoyaltyDiscountChange?.(discount);
  }, [discount, onLoyaltyDiscountChange]);
  useEffect(() => {
    onCreditChange?.(creditDiscount);
  }, [creditDiscount, onCreditChange]);

  // Le message générique de bas de formulaire (menu changé, erreur serveur…)
  // ne doit jamais rester hors écran : sans ça, le client qui n'a pas
  // redescendu croit que son clic n'a rien fait et vient en MP demander
  // pourquoi. Le cas « rupture » n'a pas besoin de ça : le panneau « Résoudre »
  // (ci-dessous) est déjà une modal, donc déjà visible.
  useEffect(() => {
    if (errors.submit) {
      submitErrorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [errors.submit]);

  // Même logique pour une erreur rattachée au créneau (délai à l'avance,
  // planning, ou une 400 VALIDATION visant `pickupTime`) : le sélecteur peut
  // être loin en dessous de la zone visible au moment du clic « Confirmer ».
  useEffect(() => {
    if (errors.pickupTime) {
      slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [errors.pickupTime]);

  // Idem pour le nom/téléphone : ces champs sont en haut du formulaire, donc
  // une 400 VALIDATION qui les vise (ex. nom à un seul mot) arrive alors que
  // le client a déjà scrollé vers le paiement, tout en bas — sans ce
  // défilement l'erreur reste invisible au-dessus de l'écran.
  useEffect(() => {
    if (errors.customerName || errors.customerPhone) {
      contactFieldsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [errors.customerName, errors.customerPhone]);

  // Ruptures détectées AVANT l'envoi (menu frais) : elles ne comptent que
  // pour un retrait aujourd'hui — un retrait planifié un autre jour laisse le
  // temps de produire (même règle que `createOrder`, lib/orders.ts).
  const deferredPickup = isDeferredPickup(
    values.timing === 'scheduled' ? values.pickupTime : null
  );
  const preSoldOutLines = deferredPickup
    ? []
    : (availability?.soldOutLines ?? []);
  const goneItems = items.filter((i) =>
    availability?.goneCartIds.includes(i.cartId)
  );

  async function send() {
    // Un article retiré de la carte bloque : rien à proposer d'autre que de
    // le retirer (le bandeau en haut du formulaire le dit).
    if (goneItems.length > 0) return;
    // Rupture connue : on ouvre directement le panneau « Résoudre » plutôt
    // que d'attendre le 409 du serveur.
    if (preSoldOutLines.length > 0) {
      showSoldOutLines(preSoldOutLines);
      return;
    }
    const outcome = await submit(activeReward, useCredit);
    if (outcome.ok)
      onSuccess(outcome.orderId, outcome.paymentUrl, outcome.paymentError);
    // Récompense consommée entre-temps : on la retire pour que le prochain
    // envoi passe sans elle (le message l'explique au client).
    if (!outcome.ok && outcome.code === 'LOYALTY_REWARD_UNAVAILABLE') {
      setRewardApplied(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await send();
  }

  // Résolution d'une rupture — le panier est la source de vérité : une ligne
  // remplacée ou retirée en disparaît, une ligne reportée y est marquée
  // `soldOutToday` (J+1 minimum via `effectiveItemAdvanceDays`).
  function handleRemove(cartId: string) {
    const item = items.find((i) => i.cartId === cartId);
    if (item) trackRemoveFromCart([cartItemToAnalyticsItem(item)]);
    removeItem(cartId);
  }

  function handleDeferAll(cartIds: string[]) {
    patchItems(
      Object.fromEntries(cartIds.map((id) => [id, { soldOutToday: true }]))
    );
    clearSoldOutLines();
    // Le sélecteur bascule seul en « Planifier » dès qu'un article exige
    // J+1 ; on y amène le client pour qu'il choisisse son créneau.
    setField('timing', 'scheduled');
    setField('pickupTime', null);
    requestAnimationFrame(() =>
      slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  }

  return {
    values,
    errors,
    isSubmitting,
    setField,
    soldOutLines,
    showSoldOutLines,
    clearSoldOutLines,
    replaceItem,
    updateQuantity,
    slotRef,
    contactFieldsRef,
    submitErrorRef,
    minAdvanceOrderDays,
    soldOutRestricted,
    precommandePure,
    pickupInfo,
    reward,
    rewardApplied,
    setRewardApplied,
    creditOffer,
    creditApplied,
    setCreditApplied,
    loyaltyMessage,
    payOnline,
    amountDue,
    goneItems,
    preSoldOutLines,
    send,
    handleSubmit,
    handleRemove,
    handleDeferAll,
  };
}
