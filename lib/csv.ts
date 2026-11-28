// lib/csv.ts
//
// Génération CSV sans dépendance, pensée pour Excel en locale FR :
// - séparateur point-virgule (Excel FR découpe sur `;`)
// - fin de ligne CRLF
// - BOM UTF-8 en tête pour que les accents s'affichent correctement
//
// Les nombres sont laissés bruts (entiers FCFA) pour rester numériques dans
// le tableur ; le formatage d'affichage reste la responsabilité de l'UI.

const DEFAULT_DELIMITER = ';';
const EOL = '\r\n';
const BOM = '﻿';

type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell, delimiter: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  const s = String(value);
  if (s.includes(delimiter) || /["\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type CsvOptions = {
  /** Séparateur de colonnes (défaut `;`, Excel FR). */
  delimiter?: string;
  /** BOM UTF-8 en tête (défaut `true`, pour Excel). */
  bom?: boolean;
};

/**
 * Construit une chaîne CSV depuis un en-tête et des lignes. Par défaut : format
 * Excel FR (`;`, BOM). Les imports tiers (Google Contacts…) veulent `,` et pas
 * de BOM : `{ delimiter: ',', bom: false }`.
 */
export function toCsv(
  headers: string[],
  rows: Cell[][],
  { delimiter = DEFAULT_DELIMITER, bom = true }: CsvOptions = {}
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCell(cell, delimiter)).join(delimiter)
  );
  return (bom ? BOM : '') + lines.join(EOL) + EOL;
}

/** Réponse HTTP de téléchargement CSV (attachment). */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
