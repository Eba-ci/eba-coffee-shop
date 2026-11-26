// POST /api/contact : fermée tant que le formulaire est masqué
// (`CONTACT_FORM_ENABLED`), comportement d'origine quand il est actif.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
const flag = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/lib/contact-email', () => ({ sendContactMessageEmail: send }));
vi.mock('@/config/constants/contact', () => ({
  get CONTACT_FORM_ENABLED() {
    return flag.enabled;
  },
  CONTACT_FORM_CLOSED_MESSAGE: 'Formulaire désactivé.',
}));

import { POST } from './route';

const VALID = {
  name: 'Kofi Yao',
  email: 'kofi@example.com',
  phone: '',
  subject: 'question',
  message: 'Bonjour, une question sur une réservation.',
};

function req(body: unknown, ip = '10.0.0.1') {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue(true);
});

describe('POST /api/contact — formulaire masqué', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('répond 410 et n’envoie aucun e-mail, même pour un message valide', async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'Formulaire désactivé.' });
    expect(send).not.toHaveBeenCalled();
  });

  it('répond 410 avant de valider le corps (pas de 400)', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(410);
  });
});

describe('POST /api/contact — formulaire actif', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

  it('transmet un message valide', async () => {
    const res = await POST(req(VALID, '10.0.0.2'));
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuse un message invalide', async () => {
    const res = await POST(req({ name: '' }, '10.0.0.3'));
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('503 quand l’acheminement échoue', async () => {
    send.mockResolvedValue(false);
    const res = await POST(req(VALID, '10.0.0.4'));
    expect(res.status).toBe(503);
  });
});
