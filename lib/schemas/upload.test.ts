// lib/schemas/upload.test.ts
import { describe, it, expect } from 'vitest';
import { imageUrlSchema } from './upload';

describe('imageUrlSchema', () => {
  it('accepte un chemin d’upload local relatif', () => {
    expect(imageUrlSchema.safeParse('/uploads/products/x.jpg').success).toBe(
      true
    );
  });

  it('accepte une URL absolue http(s)', () => {
    expect(
      imageUrlSchema.safeParse('https://cdn.example.com/a.png').success
    ).toBe(true);
  });

  it('rejette une valeur qui n’est ni un chemin ni une URL', () => {
    expect(imageUrlSchema.safeParse('pas-une-url').success).toBe(false);
  });

  it('rejette une chaîne vide', () => {
    expect(imageUrlSchema.safeParse('').success).toBe(false);
  });
});
