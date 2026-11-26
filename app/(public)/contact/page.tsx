import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/(public)/breadcrumb-json-ld';
import ContactHeroSection from '@/components/(public)/contact/contact-hero-section';
import ContactFormSection from '@/components/(public)/contact/contact-form-section';
import ContactInfoSection from '@/components/(public)/contact/contact-info-section';
import ContactMapSection from '@/components/(public)/contact/contact-map-section';
import { getContactSettings } from '@/lib/contact-settings-db';
import { getPickupSettings } from '@/lib/pickup-settings-db';
import { summarizeWeeklyHours } from '@/lib/pickup-settings';
import { OG_IMAGE } from '@/config/constants';
import { CONTACT_FORM_ENABLED } from '@/config/constants/contact';

const DESCRIPTION = CONTACT_FORM_ENABLED
  ? 'Contactez EBA Coffee Shop à Abidjan. Réservation, question ou partenariat — écrivez-nous ou passez nous voir à Cocody.'
  : 'Contactez EBA Coffee Shop à Abidjan. Réservation, question ou partenariat — écrivez-nous sur WhatsApp ou passez nous voir à Cocody.';

export const metadata: Metadata = {
  title: 'Contact — nous trouver à Cocody',
  description: DESCRIPTION,
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact — nous trouver à Cocody',
    description: DESCRIPTION,
    url: '/contact',
    images: [{ ...OG_IMAGE, alt: 'Contact — EBA Coffee Shop' }],
  },
};

export default async function ContactPage() {
  const [contact, pickup] = await Promise.all([
    getContactSettings(),
    getPickupSettings(),
  ]);
  const hoursLabel = summarizeWeeklyHours(pickup.weeklyHours);
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: 'Contact', path: '/contact' }]} />
      <ContactHeroSection contact={contact} />
      {CONTACT_FORM_ENABLED ? (
        <ContactFormSection contact={contact} hoursLabel={hoursLabel} />
      ) : (
        <ContactInfoSection contact={contact} hoursLabel={hoursLabel} />
      )}
      <ContactMapSection contact={contact} hoursLabel={hoursLabel} />
    </>
  );
}
