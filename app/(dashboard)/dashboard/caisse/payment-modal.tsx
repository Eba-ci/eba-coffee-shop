'use client';

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { Plus } from 'lucide-react';
import { CashTenderPanel } from './_components/payment/cash-tender-panel';
import { priceFormatter } from './_components/payment/format';
import { SingleModeGrid } from './_components/payment/single-mode-grid';
import { SplitLines } from './_components/payment/split-lines';
import type { PaymentLine } from './_components/payment/types';
import { usePaymentForm } from './_components/payment/use-payment-form';
import { useCreditOffer } from './_components/payment/use-credit-offer';

export type { PaymentLine } from './_components/payment/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  orderRef: string;
  amount: number;
  isSubmitting: boolean;
  onConfirm: (payments: PaymentLine[]) => void;
  error?: string | null;
  /** Commande à encaisser : permet de proposer l'avoir de son client. */
  orderId?: string;
};

/**
 * Modale d'encaissement. Chemin rapide inchangé pour le cas courant (un seul
 * moyen de paiement) : taper un moyen → « Marquer payée » activable
 * immédiatement, même nombre de taps qu'avant le paiement fractionné.
 * « + Ajouter un moyen de paiement » révèle une saisie fractionnée (montant
 * éditable par ligne + solde restant) — la confirmation reste bloquée tant
 * que la somme des lignes ne couvre pas exactement le montant.
 */
export function PaymentModal({
  isOpen,
  onClose,
  orderRef,
  amount,
  isSubmitting,
  onConfirm,
  error,
  orderId,
}: Props) {
  const offer = useCreditOffer(orderId, isOpen);
  // L'avoir est appliqué d'office (retenu dès la création) : seul un refus explicite l'écarte.
  const [declineCredit, setDeclineCredit] = useState(false);
  // Un refus ne survit pas à la fermeture : la prochaine ouverture repart avec l'avoir.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setDeclineCredit(false);
  }
  const useCredit = !declineCredit;
  const credit = useCredit && offer ? offer.applicable : 0;
  const toPay = amount - credit;
  // Avoir qui couvre tout (réglages à 0 F de reste minimum) : plus rien à encaisser.
  const creditOnly = credit > 0 && toPay === 0;
  const form = usePaymentForm({
    amount: toPay,
    isSubmitting,
    onClose,
    onConfirm: (payments) =>
      onConfirm(
        credit > 0 ? [...payments, { mode: 'AVOIR', amount: credit }] : payments
      ),
  });
  const {
    isSplit,
    canConfirm,
    showSingleGrid,
    showCashTender,
    handleClose,
    handleConfirm,
    startSplit,
  } = form;
  const confirmDisabled = creditOnly ? false : !canConfirm;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      placement="center"
      scrollBehavior="inside"
      size={isSplit ? 'md' : 'sm'}
      classNames={{ base: 'mx-3 my-3 max-h-[calc(100dvh-1.5rem)] sm:mx-6' }}
      isDismissable={!isSubmitting}
      hideCloseButton={isSubmitting}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-semibold">Encaisser</span>
          <span className="text-sm font-normal text-muted-foreground">
            Commande {orderRef} ·{' '}
            <span className="font-medium tabular-nums">
              {priceFormatter.format(toPay)} F
            </span>
          </span>
        </ModalHeader>
        <ModalBody>
          {offer && (
            <label className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={useCredit}
                disabled={isSubmitting}
                onChange={(e) => setDeclineCredit(!e.target.checked)}
              />
              <span>
                Avoir du client :{' '}
                <span className="font-semibold tabular-nums">
                  −{priceFormatter.format(offer.applicable)} F
                </span>
                <span className="block text-xs text-muted-foreground">
                  Solde {priceFormatter.format(offer.balance)} F · reste à
                  encaisser {priceFormatter.format(amount - offer.applicable)} F
                </span>
              </span>
            </label>
          )}
          {!creditOnly && showSingleGrid && (
            <SingleModeGrid form={form} isSubmitting={isSubmitting} />
          )}

          {!creditOnly && showCashTender && (
            <CashTenderPanel
              form={form}
              amount={toPay}
              isSubmitting={isSubmitting}
            />
          )}

          {!creditOnly && isSplit && (
            <SplitLines form={form} isSubmitting={isSubmitting} />
          )}

          {!creditOnly && (
            <button
              type="button"
              onClick={startSplit}
              disabled={isSubmitting}
              className="mt-2 flex items-center gap-1 self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un moyen de paiement
            </button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </ModalBody>
        <ModalFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            color="default"
            variant="light"
            onPress={handleClose}
            isDisabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            className="w-full sm:w-auto"
            color="primary"
            onPress={
              creditOnly
                ? () => onConfirm([{ mode: 'AVOIR', amount: credit }])
                : handleConfirm
            }
            isDisabled={confirmDisabled || isSubmitting}
            isLoading={isSubmitting}
          >
            Marquer payée
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
