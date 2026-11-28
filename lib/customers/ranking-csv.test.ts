import { describe, expect, it } from 'vitest';
import { buildRankingCsv, type RankedRow } from './ranking-csv';

const row = (over: Partial<RankedRow> = {}): RankedRow => ({
  name: 'Awa Koné',
  phone: '+2250788123456',
  total: 52000,
  orders: 8,
  days: 6,
  firstOrderAt: new Date('2026-01-05T10:00:00Z'),
  lastOrderAt: new Date('2026-11-20T18:30:00Z'),
  ...over,
});

describe('buildRankingCsv', () => {
  it('numérote le rang selon l’ordre reçu et écrit les dates en jour/mois/année', () => {
    const csv = buildRankingCsv([row(), row({ name: 'Bako', total: 1000 })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM : Excel lit l'UTF-8
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(
      'Rang;Nom;Téléphone;Total acheté (FCFA);Commandes;Jours avec commande;Première commande;Dernière commande'
    );
    expect(lines[1]).toBe(
      '1;Awa Koné;+225 07 88 12 34 56;52000;8;6;05/01/2026;20/11/2026'
    );
    expect(lines[2].startsWith('2;Bako;')).toBe(true);
  });

  it('écrit le téléphone avec des espaces (Excel ne le lit pas comme un nombre)', () => {
    const csv = buildRankingCsv([row()]);
    expect(csv).toContain('+225 07 88 12 34 56');
    expect(csv).not.toContain(';+2250788123456;');
  });

  it('garde un client sans nom : cellule vide, numéro conservé', () => {
    const csv = buildRankingCsv([row({ name: null })]);
    expect(csv.trim().split('\r\n')[1]).toMatch(
      /^1;;\+225 07 88 12 34 56;52000;/
    );
  });

  it('met entre guillemets un nom contenant un point-virgule', () => {
    const csv = buildRankingCsv([row({ name: 'Awa; Koné' })]);
    expect(csv).toContain('"Awa; Koné"');
  });
});
