import { describe, expect, it } from 'vitest';
import { scrubPii, scrubUrl, shouldDropEvent } from './sentry.shared.config';

type Event = Parameters<typeof shouldDropEvent>[0];

const error = (value: string, url?: string): Event => ({
  exception: { values: [{ type: 'Error', value }] },
  ...(url ? { request: { url } } : {}),
});

const SERVER_ACTION =
  'Failed to find Server Action. This request might be from an older or newer deployment.';

describe('shouldDropEvent', () => {
  it('écarte « Non autorisé » (guards de page, déjà gérés par le layout)', () => {
    expect(
      shouldDropEvent(error('Non autorisé', 'https://eba-coffee.com/dashboard'))
    ).toBe(true);
  });

  it('garde un message qui ne fait que contenir « Non autorisé »', () => {
    expect(shouldDropEvent(error('Non autorisé à écrire en base'))).toBe(false);
  });

  it('écarte les Server Action introuvables ciblées par un scanner WordPress', () => {
    expect(
      shouldDropEvent(
        error(
          SERVER_ACTION,
          'https://185.237.252.216/wp-admin/admin-ajax.php?action=x'
        )
      )
    ).toBe(true);
    expect(
      shouldDropEvent(error(SERVER_ACTION, 'https://eba-coffee.com/xmlrpc.php'))
    ).toBe(true);
  });

  it('écarte les Server Action introuvables sur une IP nue', () => {
    expect(
      shouldDropEvent(error(SERVER_ACTION, 'https://185.237.252.216/'))
    ).toBe(true);
  });

  it('garde un vrai décalage de déploiement sur le domaine du site', () => {
    expect(
      shouldDropEvent(error(SERVER_ACTION, 'https://eba-coffee.com/carte'))
    ).toBe(false);
    expect(shouldDropEvent(error(SERVER_ACTION))).toBe(false);
  });

  it('garde les autres erreurs, même sur une URL de scanner', () => {
    expect(
      shouldDropEvent(error('boom', 'https://185.237.252.216/wp-admin/'))
    ).toBe(false);
  });

  it('écarte toujours les corps multipart malformés', () => {
    expect(shouldDropEvent(error('Failed to parse body as FormData.'))).toBe(
      true
    );
    expect(shouldDropEvent(error('no boundary found in multipart body'))).toBe(
      true
    );
  });

  it('ne plante pas sans exception', () => {
    expect(shouldDropEvent({ message: 'hello' })).toBe(false);
  });
});

describe('scrubUrl / scrubPii', () => {
  it('retire le jeton de commande et la query string des URLs', () => {
    expect(scrubUrl('https://eba-coffee.com/commande/clx9abc123?x=1')).toBe(
      'https://eba-coffee.com/commande/:id'
    );
    expect(scrubUrl('https://eba-coffee.com/api/loyalty-info?phone=0700')).toBe(
      'https://eba-coffee.com/api/loyalty-info'
    );
  });

  it('supprime corps, cookies, IP et e-mail de l’événement', () => {
    const event = scrubPii({
      request: {
        url: 'https://eba-coffee.com/api/commandes/clx9abc123?phone=0700',
        data: { customerPhone: '0700000000' },
        cookies: { session: 'secret' },
        query_string: 'phone=0700000000',
        headers: { cookie: 'a=b', accept: '*/*' },
      },
      user: { id: 'u1', email: 'a@b.ci', ip_address: '1.2.3.4' },
    });
    expect(event.request).not.toHaveProperty('data');
    expect(event.request).not.toHaveProperty('cookies');
    expect(event.request?.url).toBe('https://eba-coffee.com/api/commandes/:id');
    expect(event.request?.headers).toEqual({ accept: '*/*' });
    expect(event.user).toEqual({ id: 'u1' });
  });

  it('neutralise tout détail employé / salaire (extra, contextes, balises, fils d’Ariane)', () => {
    const event = scrubPii({
      extra: {
        employee: { name: 'Awa', salaryAmount: 250_000 },
        orderId: 'ord-1',
      },
      contexts: { payroll: { total: 5_000 } },
      tags: { env: 'prod', salaryMonth: '2026-06' },
      breadcrumbs: [
        {
          data: {
            employees: [{ name: 'Awa' }],
            url: 'https://eba-coffee.com/dashboard/depenses',
          },
        },
      ],
    });
    expect(event.extra?.employee).toBe('[masqué]');
    expect(event.extra?.orderId).toBe('ord-1');
    expect((event.contexts as Record<string, unknown>).payroll).toBe(
      '[masqué]'
    );
    expect(event.tags?.salaryMonth).toBe('[masqué]');
    expect(event.tags?.env).toBe('prod');
    const crumbData = event.breadcrumbs?.[0].data as Record<string, unknown>;
    expect(crumbData.employees).toBe('[masqué]');
    expect(crumbData.url).toBe('https://eba-coffee.com/dashboard/depenses');
  });

  it('masque les montants sensibles dans les messages libres (message, exception, fil d’Ariane)', () => {
    const event = scrubPii({
      message: 'Échec enregistrement paie — montant: 123456 refusé',
      exception: { values: [{ value: 'salaire: 987654 introuvable' }] },
      breadcrumbs: [{ message: 'employee amount = 55555' }],
    });
    expect(event.message).not.toContain('123456');
    expect(event.message).toContain('[masqué]');
    expect(event.exception?.values?.[0].value).not.toContain('987654');
    expect(event.exception?.values?.[0].value).toContain('[masqué]');
    expect(event.breadcrumbs?.[0].message).not.toContain('55555');
    expect(event.breadcrumbs?.[0].message).toContain('[masqué]');
  });

  it('le filet de texte ne prétend PAS masquer un nom d’employé libre', () => {
    // Limite assumée : un nom sans mot-clé/montant détectable n'est pas masqué
    // par le filet (c'est le rôle des messages d'erreur génériques côté source).
    const event = scrubPii({ message: 'Employé Awa Traoré introuvable' });
    expect(event.message).toBe('Employé Awa Traoré introuvable');
  });
});
