// app/api/internal/revalidate/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { revalidatePath, readFile } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('node:fs/promises', () => ({ readFile, default: { readFile } }));

import { POST } from './route';

const MANIFEST = {
  routes: {
    '/': {},
    '/cgv': {},
    '/carte/commande': {},
    '/sitemap.xml': {},
    '/llms.txt': {},
    '/api/menu': {},
    '/_not-found': {},
    '/_global-error': {},
    '/favicon.ico': {},
    '/icon0.svg': {},
    '/manifest.json': {},
  },
};

const call = (auth?: string) =>
  POST(
    new Request('http://localhost/api/internal/revalidate', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    })
  );

beforeEach(() => {
  revalidatePath.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(JSON.stringify(MANIFEST));
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/internal/revalidate', () => {
  it('est inerte (404) sans CRON_SECRET', async () => {
    const res = await call('Bearer x');
    expect(res.status).toBe(404);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuse un secret absent ou erroné (401)', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-ok');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer autre')).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("invalide tout l'arbre depuis le layout racine", async () => {
    vi.stubEnv('CRON_SECRET', 'secret-ok');
    const res = await call('Bearer secret-ok');
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('renvoie les pages prérendues, sans fichiers générés ni pages internes', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-ok');
    const body = await (await call('Bearer secret-ok')).json();
    expect(body.paths).toEqual([
      '/',
      '/api/menu',
      '/carte/commande',
      '/cgv',
      '/llms.txt',
      '/sitemap.xml',
    ]);
  });

  it('répond avec une liste vide si le manifeste est illisible', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-ok');
    readFile.mockRejectedValue(new Error('ENOENT'));
    const body = await (await call('Bearer secret-ok')).json();
    expect(body).toEqual({ ok: true, paths: [] });
  });
});
