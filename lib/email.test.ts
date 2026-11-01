// lib/email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mockSend } };
  }),
}));

vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html>mock email</html>'),
}));

vi.mock('@/emails/new-order', () => ({
  default: vi.fn().mockReturnValue(null),
}));

import { sendNewOrderEmail, sendOtpEmail } from './email';

const mockOrder = {
  id: 'clorder123',
  reference: 'EBA-20260510-AB12',
  customerName: 'Kofi',
  customerPhone: '07001234',
  pickupTime: new Date('2026-05-10T14:30:00'),
  items: [
    {
      cartId: 'abc',
      productId: 'prod-1',
      productName: 'Cappuccino',
      basePrice: 3500,
      quantity: 1,
      supplements: [],
    },
  ],
  total: 3500,
};

describe('sendNewOrderEmail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
  });

  it("envoie l'email au bon destinataire (OWNER_EMAIL)", async () => {
    process.env.OWNER_EMAIL = 'owner@test.com';

    await sendNewOrderEmail(mockOrder);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@test.com' })
    );
  });

  it("le sujet de l'email contient la référence de commande", async () => {
    process.env.OWNER_EMAIL = 'owner@test.com';

    await sendNewOrderEmail(mockOrder);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('EBA-20260510-AB12'),
      })
    );
  });

  it('si OWNER_EMAIL absent, log un warning et ne pas appeler Resend', async () => {
    delete process.env.OWNER_EMAIL;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await sendNewOrderEmail(mockOrder);

    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OWNER_EMAIL')
    );
    warnSpy.mockRestore();
  });

  it('si Resend échoue, sendNewOrderEmail rejette la promesse', async () => {
    process.env.OWNER_EMAIL = 'owner@test.com';
    mockSend.mockRejectedValue(new Error('Resend API error'));

    await expect(sendNewOrderEmail(mockOrder)).rejects.toThrow(
      'Resend API error'
    );
  });
});

describe('staging', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
  });

  it("n'appelle jamais Resend quand APP_ENV=staging", async () => {
    vi.stubEnv('APP_ENV', 'staging');
    process.env.OWNER_EMAIL = 'owner@test.com';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendNewOrderEmail(mockOrder);
    await sendOtpEmail('staff@test.com', '123456');

    expect(mockSend).not.toHaveBeenCalled();
    log.mockRestore();
    vi.unstubAllEnvs();
  });
});
