// lib/whatsapp/mask-phone.test.ts
//
// Aucun numéro ne doit sortir du masquage : ivoirien, étranger, sous toutes les formes.

import { describe, expect, it } from 'vitest';
import {
  containsPhoneNumber,
  maskPhoneNumbers,
  resolveContactRef,
  restoreNumbers,
} from './mask-phone';

const SAMPLES = [
  'mon numéro est le 07 07 07 07 07',
  'appelez le 0707070707 merci',
  'whatsapp +225 07 07 07 07 07',
  'au 00225 0707070707 svp',
  'contact : 07.07.07.07.07',
  'ma cousine en France : +33 6 12 34 56 78',
  'mon frère aux USA : +1 (415) 555-2671',
  'au Sénégal +221 77 123 45 67',
  'au Royaume-Uni +44 7911 123456',
  'numéro invalide mais long : 0123456789012',
];

describe('maskPhoneNumbers', () => {
  it('remplace un numéro par un repère et garde la correspondance', () => {
    const { text, refs } = maskPhoneNumbers(
      'Mon numéro : 07 07 07 07 07, merci'
    );
    expect(text).toBe('Mon numéro : [NUMÉRO_1], merci');
    expect(refs).toEqual({ NUMÉRO_1: '+2250707070707' });
  });

  it('ne laisse sortir aucun numéro, ivoirien ou étranger, sous aucune forme', () => {
    for (const sample of SAMPLES) {
      const { text } = maskPhoneNumbers(sample);
      expect(text, sample).toMatch(/\[NUMÉRO_\d+\]/);
      expect(containsPhoneNumber(text), `${sample} → ${text}`).toBe(false);
      expect(text.replace(/\D/g, '').length, text).toBeLessThanOrEqual(1);
    }
  });

  it('donne le même repère au même numéro, quelle que soit sa forme', () => {
    const { text, refs } = maskPhoneNumbers(
      '0707070707 ou +225 07 07 07 07 07, sinon 0505050505'
    );
    expect(text).toBe('[NUMÉRO_1] ou [NUMÉRO_1], sinon [NUMÉRO_2]');
    expect(Object.keys(refs)).toEqual(['NUMÉRO_1', 'NUMÉRO_2']);
  });

  it('continue la numérotation d’un message à l’autre de la conversation', () => {
    const first = maskPhoneNumbers('0707070707');
    const second = maskPhoneNumbers('et aussi 0505050505', first.refs);
    const third = maskPhoneNumbers('0707070707 encore', second.refs);

    expect(second.text).toBe('et aussi [NUMÉRO_2]');
    expect(third.text).toBe('[NUMÉRO_1] encore');
  });

  it('ne touche ni aux montants, ni aux dates, ni aux références de commande', () => {
    const text =
      'Total 1 500 F, 12 000 F, retrait le 2026-11-28 à 10:30, commande n° 42, EBA-20261003-AB12-1';
    expect(maskPhoneNumbers(text).text).toBe(text);
  });

  it('ne modifie pas ses entrées', () => {
    const known = { NUMÉRO_1: '+2250707070707' };
    maskPhoneNumbers('0505050505', known);
    expect(known).toEqual({ NUMÉRO_1: '+2250707070707' });
  });
});

describe('containsPhoneNumber', () => {
  it('détecte un numéro dans une réponse, pas un repère', () => {
    expect(containsPhoneNumber('Appelez le 07 07 07 07 07')).toBe(true);
    expect(containsPhoneNumber('Je note [NUMÉRO_1] comme contact')).toBe(false);
    expect(containsPhoneNumber('Bonjour, un croissant à 500 F ?')).toBe(false);
  });
});

describe('resolveContactRef et restoreNumbers', () => {
  const refs = { NUMÉRO_1: '+2250707070707', NUMÉRO_2: 'raw:0123456789012' };

  it('retrouve le numéro sous les formes que le modèle peut écrire', () => {
    expect(resolveContactRef('[NUMÉRO_1]', refs)).toBe('+2250707070707');
    expect(resolveContactRef('NUMÉRO_1', refs)).toBe('+2250707070707');
    expect(resolveContactRef(' numero_1 ', refs)).toBe('+2250707070707');
    expect(resolveContactRef('NUMÉRO_2', refs)).toBe('0123456789012');
  });

  it('refuse un repère inconnu ou autre chose qu’un repère', () => {
    expect(resolveContactRef('NUMÉRO_9', refs)).toBeNull();
    expect(resolveContactRef('+2250707070707', refs)).toBeNull();
    expect(resolveContactRef('', refs)).toBeNull();
  });

  it('remet les vrais numéros dans un texte fabriqué par le serveur', () => {
    expect(restoreNumbers('Contact : [NUMÉRO_1] et [NUMÉRO_7]', refs)).toBe(
      'Contact : +2250707070707 et [NUMÉRO_7]'
    );
  });
});
