// lib/whatsapp/ingest.test.ts
//
// Messages WhatsApp : idempotence par `wamid`, version, lien client par le numéro,
// identifiants sans collision, statuts livrés dans le désordre.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';

const tx = vi.hoisted(() => ({
  whatsAppMessage: { findUnique: vi.fn(), create: vi.fn() },
  whatsAppConversation: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  customer: { findUnique: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  whatsAppMessage: { updateMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import {
  applyStatusUpdates,
  errorLabel,
  ingestInboundMessages,
} from './ingest';
import type { InboundMessage } from './payload';

const NEW_CONVERSATION = {
  id: 'c1',
  userId: null,
  waId: '2250707070707',
  customerId: null,
  lastInboundAt: null,
};

function message(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    wamid: 'wamid.1',
    userId: null,
    waId: '2250707070707',
    type: 'text',
    body: 'Bonjour',
    payload: null,
    sentAt: new Date('2026-11-27T10:00:00Z'),
    ...over,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('doublon', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('ingestInboundMessages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (run: (t: typeof tx) => unknown) => run(tx)
    );
    tx.whatsAppMessage.findUnique.mockResolvedValue(null);
    tx.whatsAppConversation.findMany.mockResolvedValue([]);
    tx.whatsAppConversation.create.mockResolvedValue(NEW_CONVERSATION);
    tx.whatsAppConversation.update.mockResolvedValue({ inboundVersion: 1 });
    tx.customer.findUnique.mockResolvedValue(null);
  });

  it('crée la conversation et le message, et rend la version qui est née', async () => {
    const result = await ingestInboundMessages([message()]);

    expect(result).toEqual([
      { conversationId: 'c1', version: 1, wamid: 'wamid.1' },
    ]);
    expect(tx.whatsAppConversation.create).toHaveBeenCalledWith({
      data: { userId: null, waId: '2250707070707' },
      select: expect.any(Object),
    });
    expect(tx.whatsAppConversation.update.mock.calls[0][0].data).toMatchObject({
      inboundVersion: { increment: 1 },
      lastInboundAt: new Date('2026-11-27T10:00:00Z'),
    });
    expect(tx.whatsAppMessage.create.mock.calls[0][0].data).toMatchObject({
      wamid: 'wamid.1',
      conversationId: 'c1',
      direction: 'IN',
      status: 'RECEIVED',
      version: 1,
      body: 'Bonjour',
    });
  });

  it('ignore un message déjà vu, sans toucher au compteur', async () => {
    tx.whatsAppMessage.findUnique.mockResolvedValue({ id: 'm1' });

    expect(await ingestInboundMessages([message()])).toEqual([]);
    expect(tx.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(tx.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('range les messages dans l’ordre où ils ont été écrits', async () => {
    tx.whatsAppConversation.findMany.mockResolvedValue([
      { ...NEW_CONVERSATION },
    ]);
    tx.whatsAppConversation.update
      .mockResolvedValueOnce({ inboundVersion: 4 })
      .mockResolvedValueOnce({ inboundVersion: 5 });

    const result = await ingestInboundMessages([
      message({ wamid: 'tard', sentAt: new Date('2026-11-27T10:00:05Z') }),
      message({ wamid: 'tot', sentAt: new Date('2026-11-27T10:00:01Z') }),
    ]);

    expect(result.map((r) => [r.wamid, r.version])).toEqual([
      ['tot', 4],
      ['tard', 5],
    ]);
  });

  it('complète le BSUID ou le numéro manquant quand une seule ligne correspond', async () => {
    tx.whatsAppConversation.findMany.mockResolvedValue([
      { ...NEW_CONVERSATION, userId: null },
    ]);

    await ingestInboundMessages([message({ userId: 'CI.99' })]);

    expect(tx.whatsAppConversation.update.mock.calls[0][0].data).toMatchObject({
      userId: 'CI.99',
    });
  });

  it('ne complète rien quand le BSUID et le numéro désignent deux lignes différentes', async () => {
    tx.whatsAppConversation.findMany.mockResolvedValue([
      { ...NEW_CONVERSATION, id: 'a', userId: 'CI.99', waId: null },
      { ...NEW_CONVERSATION, id: 'b', userId: null, waId: '2250707070707' },
    ]);

    const result = await ingestInboundMessages([message({ userId: 'CI.99' })]);

    const data = tx.whatsAppConversation.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('waId');
    expect(data).not.toHaveProperty('userId');
    expect(result[0].conversationId).toBe('a');
  });

  it('rattache la conversation au client dont le numéro est celui de l’expéditeur', async () => {
    tx.customer.findUnique.mockResolvedValue({ id: 'cust1' });

    await ingestInboundMessages([message()]);

    expect(tx.customer.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2250707070707' },
      select: { id: true },
    });
    expect(tx.whatsAppConversation.update.mock.calls[0][0].data).toMatchObject({
      customer: { connect: { id: 'cust1' } },
      linkSource: 'PHONE_MATCH',
    });
  });

  it('ne cherche pas de client quand la conversation en a déjà un, ni sans numéro', async () => {
    tx.whatsAppConversation.findMany.mockResolvedValue([
      { ...NEW_CONVERSATION, customerId: 'cust1' },
    ]);
    await ingestInboundMessages([message()]);
    await ingestInboundMessages([
      message({ wamid: 'wamid.2', waId: null, userId: 'CI.5' }),
    ]);

    expect(tx.customer.findUnique).not.toHaveBeenCalled();
  });

  it('ne fait pas reculer la dernière activité avec un message rejoué en retard', async () => {
    tx.whatsAppConversation.findMany.mockResolvedValue([
      { ...NEW_CONVERSATION, lastInboundAt: new Date('2026-11-27T12:00:00Z') },
    ]);

    await ingestInboundMessages([message()]);

    expect(
      tx.whatsAppConversation.update.mock.calls[0][0].data
    ).not.toHaveProperty('lastInboundAt');
  });

  it('retente une fois après une collision d’unicité, puis renonce', async () => {
    prismaMock.$transaction
      .mockRejectedValueOnce(uniqueViolation())
      .mockImplementationOnce(async (run: (t: typeof tx) => unknown) =>
        run(tx)
      );
    expect(await ingestInboundMessages([message()])).toHaveLength(1);

    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockRejectedValue(uniqueViolation());
    await expect(ingestInboundMessages([message()])).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it('ne retente pas une autre erreur', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('base injoignable'));
    await expect(ingestInboundMessages([message()])).rejects.toThrow(
      'base injoignable'
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('applyStatusUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.whatsAppMessage.updateMany.mockResolvedValue({ count: 1 });
  });

  it('ne remplace qu’un statut moins avancé, et ne touche que nos envois', async () => {
    await applyStatusUpdates([
      { wamid: 'w1', status: 'READ', errorCode: null, errorTitle: null },
    ]);

    expect(prismaMock.whatsAppMessage.updateMany).toHaveBeenCalledWith({
      where: {
        wamid: 'w1',
        direction: 'OUT',
        status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
      },
      data: { status: 'READ', errorCode: null, errorTitle: null },
    });
  });

  it('enregistre le code d’erreur d’un échec et totalise les lignes modifiées', async () => {
    prismaMock.whatsAppMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const updated = await applyStatusUpdates([
      {
        wamid: 'w1',
        status: 'FAILED',
        errorCode: 131026,
        errorTitle: 'Injoignable',
      },
      { wamid: 'inconnu', status: 'SENT', errorCode: null, errorTitle: null },
    ]);

    expect(updated).toBe(1);
    expect(
      prismaMock.whatsAppMessage.updateMany.mock.calls[0][0].data
    ).toMatchObject({ status: 'FAILED', errorCode: 131026 });
  });
});

describe('errorLabel', () => {
  it('ne rend ni message ni contenu : le code Prisma ou le nom de l’erreur', () => {
    expect(errorLabel(uniqueViolation())).toBe('P2002');
    expect(errorLabel(new TypeError('texte du client'))).toBe('TypeError');
    expect(errorLabel('chaîne')).toBe('erreur inconnue');
  });
});
