// lib/whatsapp/payload.test.ts
//
// Lecture du corps du webhook : messages et statuts, expéditeur sans numéro (BSUID),
// éléments illisibles ignorés sans faire échouer le lot.

import { describe, expect, it } from 'vitest';
import { parseWebhook } from './payload';

function envelope(value: Record<string, unknown>, field = 'messages') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field, value }] }],
  };
}

describe('parseWebhook : messages', () => {
  it("lit l'exemple de la documentation Meta (texte, numéro et BSUID)", () => {
    const { messages } = parseWebhook(
      envelope({
        messaging_product: 'whatsapp',
        contacts: [
          {
            profile: { name: 'Sheena' },
            wa_id: '16505551234',
            user_id: 'US.1',
          },
        ],
        messages: [
          {
            from: '16505551234',
            from_user_id: 'US.13491208655302741918',
            id: 'wamid.ABC',
            timestamp: '1749416383',
            type: 'text',
            text: { body: 'Does it come in another color?' },
          },
        ],
      })
    );
    expect(messages).toEqual([
      {
        wamid: 'wamid.ABC',
        userId: 'US.13491208655302741918',
        waId: '16505551234',
        type: 'text',
        body: 'Does it come in another color?',
        payload: null,
        sentAt: new Date(1749416383 * 1000),
      },
    ]);
  });

  it("accepte un expéditeur sans numéro (nom d'utilisateur adopté)", () => {
    const { messages } = parseWebhook(
      envelope({
        messages: [
          {
            from_user_id: 'CI.99',
            id: 'wamid.B',
            timestamp: '1749416383',
            type: 'text',
            text: { body: 'Bonjour' },
          },
        ],
      })
    );
    expect(messages[0]).toMatchObject({ userId: 'CI.99', waId: null });
  });

  it('lit un clic de bouton et un choix de liste', () => {
    const { messages } = parseWebhook(
      envelope({
        messages: [
          {
            from: '2250707070707',
            id: 'wamid.C',
            timestamp: '1',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'confirm', title: 'Confirmer' },
            },
          },
          {
            from: '2250707070707',
            id: 'wamid.D',
            timestamp: '2',
            type: 'interactive',
            interactive: { list_reply: { id: 'menu_1', title: 'Commander' } },
          },
        ],
      })
    );
    expect(messages[0]).toMatchObject({
      body: 'Confirmer',
      payload: { buttonId: 'confirm' },
    });
    expect(messages[1]).toMatchObject({
      body: 'Commander',
      payload: { buttonId: 'menu_1' },
    });
  });

  it("ne garde d'un média que son identifiant et sa légende", () => {
    const { messages } = parseWebhook(
      envelope({
        messages: [
          {
            from: '2250707070707',
            id: 'wamid.E',
            timestamp: '1',
            type: 'audio',
            audio: { id: 'media-1', mime_type: 'audio/ogg' },
          },
          {
            from: '2250707070707',
            id: 'wamid.F',
            timestamp: '2',
            type: 'image',
            image: {
              id: 'media-2',
              mime_type: 'image/jpeg',
              caption: 'le gâteau',
            },
          },
        ],
      })
    );
    expect(messages[0]).toMatchObject({
      type: 'audio',
      body: null,
      payload: { mediaId: 'media-1', mimeType: 'audio/ogg' },
    });
    expect(messages[1]).toMatchObject({ body: 'le gâteau' });
  });

  it('garde un type inconnu avec un corps vide, et date le message à défaut', () => {
    const before = Date.now();
    const { messages } = parseWebhook(
      envelope({
        messages: [{ from: '2250707070707', id: 'wamid.G', type: 'order' }],
      })
    );
    expect(messages[0]).toMatchObject({
      type: 'order',
      body: null,
      payload: null,
    });
    expect(messages[0].sentAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('ignore un message illisible sans perdre les autres du lot', () => {
    const { messages } = parseWebhook(
      envelope({
        messages: [
          { from: '2250707070707', type: 'text' },
          'pas un objet',
          {
            from: '2250707070707',
            id: 'wamid.H',
            timestamp: '1',
            type: 'text',
          },
        ],
      })
    );
    expect(messages.map((m) => m.wamid)).toEqual(['wamid.H']);
  });
});

describe('parseWebhook : statuts', () => {
  it('lit les quatre statuts connus et ignore les autres', () => {
    const { statuses } = parseWebhook(
      envelope({
        statuses: [
          { id: 'w1', status: 'sent' },
          { id: 'w2', status: 'delivered' },
          { id: 'w3', status: 'read' },
          { id: 'w4', status: 'failed' },
          { id: 'w5', status: 'deleted' },
        ],
      })
    );
    expect(statuses.map((s) => [s.wamid, s.status])).toEqual([
      ['w1', 'SENT'],
      ['w2', 'DELIVERED'],
      ['w3', 'READ'],
      ['w4', 'FAILED'],
    ]);
  });

  it("ne garde l'erreur que pour un échec", () => {
    const { statuses } = parseWebhook(
      envelope({
        statuses: [
          {
            id: 'w1',
            status: 'failed',
            errors: [{ code: 131026, title: 'Message undeliverable' }],
          },
          { id: 'w2', status: 'sent', errors: [{ code: 1, title: 'x' }] },
        ],
      })
    );
    expect(statuses[0]).toMatchObject({
      errorCode: 131026,
      errorTitle: 'Message undeliverable',
    });
    expect(statuses[1]).toMatchObject({ errorCode: null, errorTitle: null });
  });
});

describe('parseWebhook : enveloppe', () => {
  it("ignore un autre objet, un autre champ ou un corps qui n'est pas un objet", () => {
    expect(parseWebhook({ object: 'page', entry: [] })).toEqual({
      messages: [],
      statuses: [],
    });
    expect(
      parseWebhook(
        envelope(
          { messages: [{ from: '1', id: 'w', timestamp: '1', type: 'text' }] },
          'message_template_status_update'
        )
      )
    ).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook('texte')).toEqual({ messages: [], statuses: [] });
  });

  it('lit un lot mêlant messages et statuts de plusieurs entrées', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  { from: '1', id: 'wm1', timestamp: '1', type: 'text' },
                ],
                statuses: [{ id: 'ws1', status: 'sent' }],
              },
            },
          ],
        },
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  { from: '2', id: 'wm2', timestamp: '2', type: 'text' },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseWebhook(body);
    expect(parsed.messages.map((m) => m.wamid)).toEqual(['wm1', 'wm2']);
    expect(parsed.statuses).toHaveLength(1);
  });
});
