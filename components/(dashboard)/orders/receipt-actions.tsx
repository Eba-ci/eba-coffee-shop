'use client';

import { FileText, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildWhatsAppLink } from '@/lib/contact-links';

type Props = {
  orderId: string;
  code: string;
  customerPhone: string | null;
  iconOnly?: boolean;
  /** Boutons pleine largeur, grande taille (colonne d'actions de la caisse). */
  fullWidth?: boolean;
};

/** Reçu PDF : ouverture/téléchargement + envoi au client par WhatsApp. */
export function ReceiptActions({
  orderId,
  code,
  customerPhone,
  iconOnly,
  fullWidth,
}: Props) {
  const path = `/api/orders/${orderId}/receipt`;
  const size = iconOnly ? 'icon' : fullWidth ? 'lg' : 'sm';
  const box = iconOnly ? 'h-11 w-11' : fullWidth ? 'w-full' : undefined;

  function whatsappHref() {
    const url = `${window.location.origin}${path}`;
    return buildWhatsAppLink(
      customerPhone,
      `Bonjour, voici votre reçu EBA Coffee Shop (commande ${code}) : ${url}`
    );
  }

  return (
    <>
      <Button variant="outline" size={size} asChild className={box}>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Reçu PDF"
          title="Reçu PDF"
        >
          <FileText className="h-4 w-4" />
          {!iconOnly && <span>Reçu PDF</span>}
        </a>
      </Button>
      {customerPhone && (
        <Button
          type="button"
          variant="outline"
          size={size}
          className={box}
          aria-label="Envoyer le reçu par WhatsApp"
          title="Envoyer le reçu par WhatsApp"
          onClick={() => {
            const href = whatsappHref();
            if (href) window.open(href, '_blank', 'noopener,noreferrer');
          }}
        >
          <MessageCircle className="h-4 w-4" />
          {!iconOnly && <span>WhatsApp</span>}
        </Button>
      )}
    </>
  );
}
