/**
 * Formulaire de contact public (`/contact`, `POST /api/contact`).
 *
 * `false` = formulaire MASQUÉ **et** envoi fermé : la page n'affiche que les
 * coordonnées, l'API répond 410, le traitement « messages du formulaire » sort de
 * la politique de confidentialité et de `llms.txt`. Le code du formulaire
 * (`ContactFormSection`, `useContactForm`, `lib/contact-email.ts`) reste en place :
 * le remettre = passer ce drapeau à `true`.
 */
export const CONTACT_FORM_ENABLED = false;

/** Réponse de l'API (et repli affiché) quand le formulaire est fermé. */
export const CONTACT_FORM_CLOSED_MESSAGE =
  'Le formulaire de contact est désactivé. Écrivez-nous sur WhatsApp ou par téléphone.';
