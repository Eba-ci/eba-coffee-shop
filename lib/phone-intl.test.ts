// lib/phone-intl.test.ts
//
// Numéros internationaux de WhatsApp : E.164 valide, mobile ivoirien à 10 chiffres seulement.

import { describe, expect, it } from 'vitest';
import {
  isIvorianMobile,
  normalizeIvorianMobile,
  toE164,
  waIdToE164,
} from './phone-intl';

describe('toE164', () => {
  it('lit les numéros ivoiriens, avec ou sans indicatif', () => {
    expect(toE164('07 07 07 07 07')).toBe('+2250707070707');
    expect(toE164('+225 07 07 07 07 07')).toBe('+2250707070707');
    expect(toE164('00225 0707070707')).toBe('+2250707070707');
  });

  it('lit les numéros étrangers sans les déformer', () => {
    expect(toE164('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(toE164('+1 415 555 2671')).toBe('+14155552671');
    expect(toE164('+44 7911 123456')).toBe('+447911123456');
    expect(toE164('+221 77 123 45 67')).toBe('+221771234567');
  });

  it('ne reconstruit jamais un numéro ivoirien à 8 chiffres', () => {
    expect(toE164('05 12 34 56')).toBeNull();
    expect(toE164('0705')).toBeNull();
  });

  it('refuse ce qui n’est pas un numéro', () => {
    expect(toE164('bonjour')).toBeNull();
    expect(toE164('')).toBeNull();
  });
});

describe('waIdToE164', () => {
  it('ajoute le + aux chiffres envoyés par Meta', () => {
    expect(waIdToE164('2250707070707')).toBe('+2250707070707');
    expect(waIdToE164('33612345678')).toBe('+33612345678');
  });

  it('refuse un identifiant qui n’est pas un numéro', () => {
    expect(waIdToE164('CI.99')).toBeNull();
    expect(waIdToE164('')).toBeNull();
    expect(waIdToE164('1'.repeat(16))).toBeNull();
  });
});

describe('mobile ivoirien', () => {
  it('accepte les trois opérateurs, sous toutes les formes', () => {
    expect(normalizeIvorianMobile('01 02 03 04 05')).toBe('+2250102030405');
    expect(normalizeIvorianMobile('0505123456')).toBe('+2250505123456');
    expect(normalizeIvorianMobile('+225 07 05 12 34 56')).toBe(
      '+2250705123456'
    );
    expect(normalizeIvorianMobile('00225 0705123456')).toBe('+2250705123456');
    expect(isIvorianMobile('07 88 12 34 56')).toBe(true);
  });

  it('un 0705… est un numéro Orange à 10 chiffres, pas un ancien numéro à 8 chiffres', () => {
    expect(normalizeIvorianMobile('0705123456')).toBe('+2250705123456');
    expect(normalizeIvorianMobile('05123456')).toBeNull();
  });

  it('refuse 8 chiffres, les fixes et les numéros étrangers', () => {
    expect(isIvorianMobile('07070707')).toBe(false);
    expect(isIvorianMobile('+225 27 21 23 45 67')).toBe(false);
    expect(isIvorianMobile('+33 6 12 34 56 78')).toBe(false);
    expect(isIvorianMobile('0807070707')).toBe(false);
    expect(isIvorianMobile('bonjour')).toBe(false);
  });
});
