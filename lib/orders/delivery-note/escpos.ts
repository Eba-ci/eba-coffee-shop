// lib/orders/delivery-note/escpos.ts
//
// Encodage ESC/POS du bon de livraison pour une imprimante thermique 58 mm
// (32 colonnes). ASCII pur : les accents sont repliés, ce qui évite toute
// dépendance à la page de codes de l'imprimante.

import type { DeliveryNote } from './build';

export const TICKET_COLUMNS = 32;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export function toAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[×]/g, 'x')
    .replace(/[’‘]/g, "'")
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Retour à la ligne par mots, `indent` espaces en tête des lignes suivantes. */
export function wrapText(
  text: string,
  width = TICKET_COLUMNS,
  indent = 0
): string[] {
  const words = toAscii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const pad = ' '.repeat(indent);
  for (let word of words) {
    while (word.length > width - (lines.length > 0 ? indent : 0)) {
      const room = width - (lines.length > 0 || current ? indent : 0);
      const head = word.slice(0, room);
      if (current) lines.push(current);
      lines.push(head);
      current = '';
      word = word.slice(room);
    }
    const candidate = current ? `${current} ${word}` : word;
    const limit = width - (lines.length > 0 ? indent : 0);
    if (candidate.length > limit && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.map((l, i) => (i === 0 ? l : pad + l));
}

/** Bitmap monochrome : 1 bit par pixel, 8 pixels par octet, ligne après ligne. */
export type LogoRaster = {
  widthBytes: number;
  height: number;
  data: Uint8Array;
};

export function encodeDeliveryNote(
  note: DeliveryNote,
  logo?: LogoRaster | null
): Uint8Array {
  const out: number[] = [];
  const bytes = (...b: number[]) => out.push(...b);
  const text = (s: string) => {
    for (const ch of toAscii(s)) out.push(ch.charCodeAt(0));
  };
  const line = (s = '') => {
    text(s);
    bytes(LF);
  };
  const align = (n: 0 | 1) => bytes(ESC, 0x61, n);
  const bold = (on: boolean) => bytes(ESC, 0x45, on ? 1 : 0);
  const size = (n: 0 | 0x11) => bytes(GS, 0x21, n);
  const rule = () => line('-'.repeat(TICKET_COLUMNS));

  bytes(ESC, 0x40); // init
  align(1);
  if (logo && logo.widthBytes > 0 && logo.height > 0) {
    // GS v 0 : impression d'un bitmap raster (mode normal).
    bytes(
      GS,
      0x76,
      0x30,
      0x00,
      logo.widthBytes & 0xff,
      logo.widthBytes >> 8,
      logo.height & 0xff,
      logo.height >> 8
    );
    for (const b of logo.data) out.push(b);
  }
  bold(true);
  line('EBA COFFEE SHOP');
  line('BON DE LIVRAISON');
  bold(false);
  size(0x11);
  bold(true);
  line(note.code);
  bold(false);
  size(0);
  line(note.dailyNumber);
  align(0);
  rule();
  line(`Client : ${note.customer}`);
  if (note.pickup) line(`Pour : ${note.pickup}`);
  rule();
  for (const l of note.lines) {
    bold(true);
    for (const w of wrapText(
      `${l.quantity}x ${l.productName}`,
      TICKET_COLUMNS,
      3
    ))
      line(w);
    bold(false);
    if (l.flavors.length > 0)
      for (const w of wrapText(
        `Gouts : ${l.flavors.join(', ')}`,
        TICKET_COLUMNS,
        5
      ))
        line(`  ${w}`);
    if (l.extras.length > 0)
      for (const w of wrapText(`+ ${l.extras.join(', ')}`, TICKET_COLUMNS, 5))
        line(`  ${w}`);
  }
  if (note.note) {
    rule();
    for (const w of wrapText(`Note : ${note.note}`)) line(w);
  }
  rule();
  bytes(LF, LF, LF);
  bytes(GS, 0x56, 0x42, 0x00); // coupe partielle
  return Uint8Array.from(out);
}

/** Lien d'intention RawBT : ouvre l'app et lui confie les octets à imprimer. */
export function rawbtUrl(data: Uint8Array): string {
  return `rawbt:base64,${Buffer.from(data).toString('base64')}`;
}
