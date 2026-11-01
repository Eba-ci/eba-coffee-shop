// lib/email.tsx
import React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import NewOrderEmail from '@/emails/new-order';
import OtpCodeEmail from '@/emails/otp-code';
import InviteStaffEmail from '@/emails/invite-staff';
import InventoryReminderEmail, {
  type InventoryReminderItem,
} from '@/emails/inventory-reminder';
import type { CartItem } from '@/lib/cart-store';
import { skipEmailInStaging } from '@/lib/app-env';

type OrderData = {
  id: string;
  reference: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupTime: Date | null;
  items: CartItem[];
  total: number;
};

export async function sendNewOrderEmail(order: OrderData): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.warn('[email] OWNER_EMAIL non défini — notification ignorée');
    return;
  }
  if (skipEmailInStaging('nouvelle commande', ownerEmail)) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = await render(React.createElement(NewOrderEmail, { order }));

  await resend.emails.send({
    from: 'EBA Coffee Shop <noreply@ebacoffeeshop.ci>',
    to: ownerEmail,
    subject: `🛎️ Nouvelle commande EBA — Réf. ${order.reference}`,
    html,
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (skipEmailInStaging('code de connexion', to)) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = await render(React.createElement(OtpCodeEmail, { code }));
  const from =
    process.env.RESEND_FROM ?? 'EBA Coffee Shop <onboarding@resend.dev>';

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `Votre code de connexion EBA : ${code}`,
    html,
  });

  if (error) {
    console.error('[email] Resend OTP error:', error);
    throw new Error(`Resend a refusé l'envoi : ${error.message}`);
  }
  console.log('[email] OTP envoyé, id Resend:', data?.id);
}

export async function sendInventoryReminderEmail(params: {
  daysSince: number;
  recipients: string[];
  lowStockItems: InventoryReminderItem[];
}): Promise<void> {
  if (params.recipients.length === 0) return;
  if (skipEmailInStaging('rappel inventaire', params.recipients)) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = await render(
    React.createElement(InventoryReminderEmail, {
      daysSince: params.daysSince,
      lowStockItems: params.lowStockItems,
    })
  );
  const from =
    process.env.RESEND_FROM ?? 'EBA Coffee Shop <onboarding@resend.dev>';

  const { error } = await resend.emails.send({
    from,
    to: params.recipients,
    subject: `📦 Inventaire à mettre à jour (${params.daysSince} j sans comptage)`,
    html,
  });

  if (error) {
    console.error('[email] Resend inventory reminder error:', error);
    throw new Error(`Resend a refusé l'envoi : ${error.message}`);
  }
}

export async function sendStaffInviteEmail(params: {
  to: string;
  inviterName: string;
  roleLabel: string;
  loginUrl: string;
}): Promise<void> {
  if (skipEmailInStaging('invitation équipe', params.to)) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = await render(React.createElement(InviteStaffEmail, params));
  const from =
    process.env.RESEND_FROM ?? 'EBA Coffee Shop <onboarding@resend.dev>';

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: `Bienvenue dans l'équipe EBA — ${params.roleLabel}`,
    html,
  });

  if (error) {
    console.error('[email] Resend invite error:', error);
    throw new Error(`Resend a refusé l'envoi : ${error.message}`);
  }
}
