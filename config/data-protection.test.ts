// Le traitement « messages du formulaire de contact » n'est publié (politique de
// confidentialité, registre ARTCI) que tant que le formulaire est actif.

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./constants/contact');
});

async function load(enabled: boolean) {
  vi.resetModules();
  vi.doMock('./constants/contact', () => ({ CONTACT_FORM_ENABLED: enabled }));
  return (await import('./data-protection')).PROCESSING_ACTIVITIES;
}

describe('PROCESSING_ACTIVITIES — formulaire de contact', () => {
  it('formulaire masqué : le traitement « contact » n’est pas publié', async () => {
    const ids = (await load(false)).map((a) => a.id);
    expect(ids).not.toContain('contact');
    // Les autres traitements sont intacts.
    expect(ids).toContain('commandes');
    expect(ids).toContain('personnel');
  });

  it('formulaire actif : le traitement « contact » est publié', async () => {
    const ids = (await load(true)).map((a) => a.id);
    expect(ids).toContain('contact');
  });
});
