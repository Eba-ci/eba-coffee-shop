// app/sitemap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetadataRoute } from 'next';

vi.mock('@/lib/polls', () => ({
  listPublicPolls: vi.fn(async () => [{ id: 'poll-1' }]),
}));

/**
 * Charge `app/sitemap.ts` avec une valeur donnée de `NEXT_PUBLIC_SITE_URL`.
 *
 * `resetModules` est indispensable : la route capture la racine du site dans
 * une constante de module, donc un simple changement de mock n'aurait aucun
 * effet sur un module déjà chargé.
 */
async function loadSitemap(envUrl: string): Promise<MetadataRoute.Sitemap> {
  vi.resetModules();
  vi.doMock('varlock/env', () => ({
    ENV: { NEXT_PUBLIC_SITE_URL: envUrl },
  }));
  const { default: sitemap } = await import('./sitemap');
  return sitemap();
}

async function loadRobots(envUrl: string): Promise<MetadataRoute.Robots> {
  vi.resetModules();
  vi.doMock('varlock/env', () => ({
    ENV: { NEXT_PUBLIC_SITE_URL: envUrl },
  }));
  const { default: robots } = await import('./robots');
  return robots();
}

beforeEach(() => {
  vi.resetModules();
});

describe('GET /sitemap.xml', () => {
  it.each([
    ['sans slash final', 'https://eba-coffee.com'],
    ['avec slash final', 'https://eba-coffee.com/'],
    ['avec plusieurs slashs finaux', 'https://eba-coffee.com//'],
  ])(
    'ne produit jamais de double slash dans le chemin (%s)',
    async (_label, envUrl) => {
      const entries = await loadSitemap(envUrl);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        // Un `//` ne doit apparaître qu'une fois, juste après le schéma.
        expect(entry.url.slice('https://'.length)).not.toContain('//');
      }
    }
  );

  it('produit les mêmes URLs quel que soit le slash final de la variable', async () => {
    const clean = await loadSitemap('https://eba-coffee.com');
    const trailing = await loadSitemap('https://eba-coffee.com/');
    expect(trailing.map((e) => e.url)).toEqual(clean.map((e) => e.url));
  });

  it('liste les pages publiques et les sondages ouverts', async () => {
    const urls = (await loadSitemap('https://eba-coffee.com/')).map(
      (e) => e.url
    );
    expect(urls).toEqual([
      'https://eba-coffee.com',
      'https://eba-coffee.com/a-propos',
      'https://eba-coffee.com/contact',
      'https://eba-coffee.com/le-lieu',
      'https://eba-coffee.com/carte',
      'https://eba-coffee.com/sondages',
      'https://eba-coffee.com/cookies',
      'https://eba-coffee.com/mentions-legales',
      'https://eba-coffee.com/confidentialite',
      'https://eba-coffee.com/cgv',
      'https://eba-coffee.com/sondages/poll-1',
    ]);
  });

  it('retombe sur les pages statiques si la base de données est indisponible', async () => {
    vi.resetModules();
    vi.doMock('varlock/env', () => ({
      ENV: { NEXT_PUBLIC_SITE_URL: 'https://eba-coffee.com/' },
    }));
    vi.doMock('@/lib/polls', () => ({
      listPublicPolls: vi.fn(async () => {
        throw new Error('DB indisponible');
      }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: sitemap } = await import('./sitemap');
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toHaveLength(10);
    expect(urls).not.toContain('https://eba-coffee.com/sondages/poll-1');
  });
});

describe('GET /robots.txt', () => {
  it('pointe vers un sitemap sans double slash', async () => {
    const trailing = await loadRobots('https://eba-coffee.com/');
    expect(trailing.sitemap).toBe('https://eba-coffee.com/sitemap.xml');
    const clean = await loadRobots('https://eba-coffee.com');
    expect(clean.sitemap).toBe(trailing.sitemap);
  });

  it('interdit tout en staging', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    const robots = await loadRobots('https://staging.eba-coffee.com');
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' });
    vi.unstubAllEnvs();
  });
});
