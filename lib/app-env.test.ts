// lib/app-env.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  STAGING_OTP,
  assertStagingDatabase,
  isStaging,
  skipEmailInStaging,
} from './app-env';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isStaging', () => {
  it('est faux par défaut et pour toute autre valeur', () => {
    expect(isStaging()).toBe(false);
    vi.stubEnv('APP_ENV', 'production');
    expect(isStaging()).toBe(false);
    vi.stubEnv('APP_ENV', 'Staging');
    expect(isStaging()).toBe(false);
  });

  it('est vrai uniquement pour « staging »', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(isStaging()).toBe(true);
  });
});

describe('assertStagingDatabase', () => {
  it('ne contrôle rien hors staging', () => {
    expect(() =>
      assertStagingDatabase('postgresql://u:p@localhost:5432/eba')
    ).not.toThrow();
  });

  it('accepte une base dont le nom contient « staging »', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(() =>
      assertStagingDatabase('postgresql://u:p@host:5432/eba_staging?sslmode=x')
    ).not.toThrow();
  });

  it.each([
    ['base de production', 'postgresql://u:p@host:5432/eba'],
    [
      '« staging » seulement dans le mot de passe',
      'postgresql://u:staging@host:5432/eba',
    ],
    ['URL illisible', 'pas-une-url'],
    ['URL absente', undefined],
  ])('refuse de démarrer : %s', (_label, url) => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(() => assertStagingDatabase(url)).toThrow(/staging/);
  });
});

describe('skipEmailInStaging', () => {
  it("laisse passer l'envoi hors staging", () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(skipEmailInStaging('test', 'a@b.c')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("ignore l'envoi en staging sans journaliser l'adresse", () => {
    vi.stubEnv('APP_ENV', 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(skipEmailInStaging('test', 'client@exemple.ci')).toBe(true);
    expect(log.mock.calls.flat().join(' ')).not.toContain('client@exemple.ci');
  });
});

describe('STAGING_OTP', () => {
  it('a la longueur attendue par le plugin (6 chiffres)', () => {
    expect(STAGING_OTP).toMatch(/^\d{6}$/);
  });
});
