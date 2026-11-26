import type { ContactSettings } from '@/lib/contact-settings';
import { ContactInfoCard } from './_components/contact-info-card';

/**
 * Section « coordonnées seules » de /contact, utilisée quand le formulaire est
 * masqué (`CONTACT_FORM_ENABLED`, config/constants/contact.ts). Même habillage que
 * `ContactFormSection`, mais une seule colonne centrée : sans formulaire, la grille
 * à deux colonnes laisserait un vide à droite.
 */
function ContactInfoSection({
  contact,
  hoursLabel,
}: {
  contact: ContactSettings;
  hoursLabel: string;
}) {
  return (
    <section
      aria-labelledby="contact-form-title"
      className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,248,1)_0%,rgba(248,242,235,1)_100%)] py-16 md:py-24"
    >
      <div
        className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-primary/12 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 left-0 h-64 w-64 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="content-container relative px-6">
        <div className="mx-auto max-w-3xl">
          <ContactInfoCard
            contact={contact}
            hoursLabel={hoursLabel}
            withForm={false}
          />
        </div>
      </div>
    </section>
  );
}

export default ContactInfoSection;
