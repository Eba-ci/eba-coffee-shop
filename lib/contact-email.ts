// lib/contact-email.ts
//
// Acheminement des messages du formulaire de contact public vers le commerce
// (OWNER_EMAIL), via Resend. Le contenu vient d'un visiteur anonyme : tout est
// échappé avant d'entrer dans le HTML, et `reply_to` permet de lui répondre.

import { Resend } from 'resend';
import type { z } from 'zod';
import type { contactFormSchema } from '@/lib/schemas/contact';
import { skipEmailInStaging } from '@/lib/app-env';

export type ContactMessage = z.infer<typeof contactFormSchema>;

const SUBJECT_LABEL: Record<ContactMessage['subject'], string> = {
  question: 'Question',
  reservation: 'Réservation',
  partenariat: 'Partenariat',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renvoie `false` si OWNER_EMAIL n'est pas configuré (message non acheminé). */
export async function sendContactMessageEmail(
  message: ContactMessage
): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.warn('[contact] OWNER_EMAIL non défini — message non acheminé');
    return false;
  }
  // Staging : message « acheminé » côté visiteur, rien ne part.
  if (skipEmailInStaging('formulaire de contact', ownerEmail)) return true;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM ?? 'EBA Coffee Shop <onboarding@resend.dev>';
  const label = SUBJECT_LABEL[message.subject];
  const html = `
    <p><strong>${escapeHtml(label)}</strong> — ${escapeHtml(message.name)}</p>
    <p>E-mail : ${escapeHtml(message.email)}${
      message.phone ? `<br>Téléphone : ${escapeHtml(message.phone)}` : ''
    }</p>
    <p style="white-space:pre-wrap">${escapeHtml(message.message)}</p>`;

  const { error } = await resend.emails.send({
    from,
    to: ownerEmail,
    replyTo: message.email,
    subject: `Contact site — ${label}`,
    html,
  });
  if (error) {
    console.error('[contact] Resend a refusé l’envoi:', error.message);
    return false;
  }
  return true;
}
