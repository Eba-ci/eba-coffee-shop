'use client';

import { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeliveryNote } from '@/lib/orders/delivery-note/build';
import { deliveryNoteHtml, printHtml } from './delivery-note-html';

type Props = {
  orderId: string;
  /** Icône seule (listes) ou icône + libellé (détail). */
  iconOnly?: boolean;
  className?: string;
};

/**
 * Imprime le bon de livraison (sans prix). Sur Android, ouvre RawBT via son
 * lien d'intention : un clic, impression thermique Bluetooth. Ailleurs (poste
 * de travail), repli sur la fenêtre d'impression du navigateur.
 */
export function PrintDeliveryNoteButton({
  orderId,
  iconOnly,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onClick() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/orders/${orderId}/delivery-note`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { note: DeliveryNote; rawbt: string };
      if (/android/i.test(navigator.userAgent)) {
        window.location.href = data.rawbt;
      } else {
        printHtml(deliveryNoteHtml(data.note));
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? 'icon' : 'sm'}
        onClick={onClick}
        disabled={busy}
        aria-label="Imprimer le bon de livraison"
        title="Imprimer le bon de livraison"
        className={iconOnly ? `h-11 w-11 ${className ?? ''}` : className}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
        {!iconOnly && <span>Bon de livraison</span>}
      </Button>
      {failed && (
        <span role="alert" className="text-xs text-destructive">
          Bon indisponible, réessayez.
        </span>
      )}
    </>
  );
}
