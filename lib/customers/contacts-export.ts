// Export des clients vers le répertoire d'un téléphone Google (Contacts).
//
// Deux formats, mêmes contacts :
// - CSV « Google Contacts » : à importer sur contacts.google.com (ordinateur),
//   puis synchronisé vers le téléphone. Virgule, sans BOM, en-têtes Google.
// - vCard 3.0 (.vcf) : s'ouvre directement sur Android / iPhone.
//
// Pur et sans base : la route (`app/api/export/customers`) lit les clients et
// passe ici. Un client n'est exporté que s'il a un NOM et un numéro CI reconnu :
// pas de contact sans nom dans le répertoire, pas de numéro dont on ignore
// l'indicatif.

import { toCsv } from '@/lib/csv';
import { normalizeIvorianPhone } from '@/lib/phone';

/** Étiquette (groupe) Google Contacts posée sur tous les contacts exportés. */
export const CONTACTS_LABEL = 'Clients EBA';

export type ContactSource = {
  name: string | null;
  phone: string;
  anonymizedAt?: Date | null;
};

export type Contact = { name: string; phone: string };

/** Contacts exportables + nombre de clients écartés (anonymisé, sans nom, numéro inexploitable). */
export function toContacts(customers: ContactSource[]): {
  contacts: Contact[];
  skipped: number;
} {
  const contacts: Contact[] = [];
  for (const c of customers) {
    const name = c.name?.replace(/\s+/g, ' ').trim();
    const phone = c.anonymizedAt ? null : normalizeIvorianPhone(c.phone);
    if (name && phone) contacts.push({ name, phone });
  }
  return { contacts, skipped: customers.length - contacts.length };
}

const GOOGLE_HEADERS = [
  'First Name',
  'Last Name',
  'Phone 1 - Label',
  'Phone 1 - Value',
  'Labels',
];

/** CSV au format d'import de Google Contacts (nom complet dans « First Name »). */
export function buildGoogleContactsCsv(contacts: Contact[]): string {
  return toCsv(
    GOOGLE_HEADERS,
    contacts.map((c) => [c.name, '', 'Mobile', c.phone, CONTACTS_LABEL]),
    { delimiter: ',', bom: false }
  );
}

/** Échappement d'une valeur texte vCard 3.0 (RFC 2426) : \ ; , et retours ligne. */
function vcardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fichier .vcf : une fiche par contact (le nom complet est le « prénom »). */
export function buildVCards(contacts: Contact[]): string {
  return contacts
    .map((c) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${vcardText(c.name)};;;`,
        `FN:${vcardText(c.name)}`,
        `TEL;TYPE=CELL:${c.phone}`,
        `CATEGORIES:${vcardText(CONTACTS_LABEL)}`,
        'END:VCARD',
      ].join('\r\n')
    )
    .join('\r\n')
    .concat(contacts.length ? '\r\n' : '');
}
