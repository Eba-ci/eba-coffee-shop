import { describe, expect, it } from 'vitest';
import { readLogoPng, readLogoRaster } from './logo';

describe('logo EBA', () => {
  it('lit le PNG et produit un bitmap monochrome non vide', async () => {
    expect(await readLogoPng()).not.toBeNull();
    const raster = await readLogoRaster();
    expect(raster).not.toBeNull();
    expect(raster!.widthBytes).toBe(30);
    expect(raster!.data.length).toBe(raster!.widthBytes * raster!.height);
    expect(raster!.data.some((b) => b !== 0)).toBe(true);
  });
});
