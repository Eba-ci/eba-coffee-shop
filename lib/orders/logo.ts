// lib/orders/logo.ts
//
// Logo EBA pour les documents générés côté serveur (reçu PDF, ticket thermique).
// PNG (et non WebP) : @react-pdf ne lit pas le WebP. Lu une seule fois ; absent
// = documents sans logo, jamais une erreur.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { LogoRaster } from '@/lib/orders/delivery-note/escpos';

const LOGO_PATH = path.join(process.cwd(), 'public/assets/logos/eba_n.png');

/** Largeur du logo sur le ticket 58 mm (multiple de 8 ; la tête en compte 384). */
const TICKET_LOGO_WIDTH = 240;
const BLACK_THRESHOLD = 170;

let cached: Promise<Buffer | null> | undefined;

export function readLogoPng(): Promise<Buffer | null> {
  cached ??= readFile(LOGO_PATH).catch(() => null);
  return cached;
}

/** Logo en bitmap monochrome (1 bit/pixel, 8 pixels par octet) pour ESC/POS. */
export async function readLogoRaster(): Promise<LogoRaster | null> {
  const png = await readLogoPng();
  if (!png) return null;
  const { data, info } = await sharp(png)
    .flatten({ background: '#ffffff' })
    .resize({ width: TICKET_LOGO_WIDTH })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const widthBytes = Math.ceil(info.width / 8);
  const bitmap = new Uint8Array(widthBytes * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < BLACK_THRESHOLD) {
        bitmap[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { widthBytes, height: info.height, data: bitmap };
}
