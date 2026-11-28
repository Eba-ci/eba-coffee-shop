import { describe, it, expect } from 'vitest';
import {
  buildGoogleContactsCsv,
  buildVCards,
  toContacts,
} from './contacts-export';

describe('toContacts', () => {
  it('écarte anonymisés, sans nom et numéros inexploitables', () => {
    const { contacts, skipped } = toContacts([
      { name: 'Awa Koné', phone: '+2250788123456' },
      { name: null, phone: '+2250788123457' },
      { name: '   ', phone: '+2250788123458' },
      { name: 'Anonyme', phone: 'anon-abc', anonymizedAt: new Date() },
      { name: 'Court', phone: '12345' },
    ]);
    expect(contacts).toEqual([{ name: 'Awa Koné', phone: '+2250788123456' }]);
    expect(skipped).toBe(4);
  });

  it('remet un numéro en E.164 et compacte les espaces du nom', () => {
    const { contacts } = toContacts([
      { name: '  Jean   Kouassi ', phone: '2250788123456' },
    ]);
    expect(contacts).toEqual([
      { name: 'Jean Kouassi', phone: '+2250788123456' },
    ]);
  });
});

describe('buildGoogleContactsCsv', () => {
  it('utilise les en-têtes Google, la virgule, sans BOM', () => {
    const csv = buildGoogleContactsCsv([
      { name: 'Awa Koné', phone: '+2250788123456' },
    ]);
    expect(csv).toBe(
      'First Name,Last Name,Phone 1 - Label,Phone 1 - Value,Labels\r\n' +
        'Awa Koné,,Mobile,+2250788123456,Clients EBA\r\n'
    );
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('met entre guillemets un nom contenant une virgule ou un guillemet', () => {
    const csv = buildGoogleContactsCsv([
      { name: 'Traoré, Moussa "Mous"', phone: '+2250788123456' },
    ]);
    expect(csv).toContain('"Traoré, Moussa ""Mous"""');
  });
});

describe('buildVCards', () => {
  it('produit une fiche vCard 3.0 par contact', () => {
    const vcf = buildVCards([{ name: 'Awa Koné', phone: '+2250788123456' }]);
    expect(vcf).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:;Awa Koné;;;',
        'FN:Awa Koné',
        'TEL;TYPE=CELL:+2250788123456',
        'CATEGORIES:Clients EBA',
        'END:VCARD',
        '',
      ].join('\r\n')
    );
  });

  it('échappe ; , et \\ dans le nom, et renvoie vide sans contact', () => {
    expect(
      buildVCards([{ name: 'A;B, C\\D', phone: '+2250788123456' }])
    ).toContain(String.raw`FN:A\;B\, C\\D`);
    expect(buildVCards([])).toBe('');
  });
});
