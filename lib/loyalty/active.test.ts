import { describe, it, expect } from 'vitest';
import {
  isLoyaltyActive,
  loyaltyFreezeReason,
  loyaltyFrozenMessage,
} from './active';

describe('loyaltyFreezeReason', () => {
  it('active quand le programme est actif et le client non désactivé', () => {
    expect(
      loyaltyFreezeReason({ enabled: true }, { loyaltyDisabled: false })
    ).toBeNull();
    expect(loyaltyFreezeReason({ enabled: true }, null)).toBeNull();
  });

  it('gelée par le programme, même pour un client non désactivé ou inconnu', () => {
    expect(
      loyaltyFreezeReason({ enabled: false }, { loyaltyDisabled: false })
    ).toBe('program');
    expect(loyaltyFreezeReason({ enabled: false }, null)).toBe('program');
  });

  it('gelée pour le client seul', () => {
    expect(
      loyaltyFreezeReason({ enabled: true }, { loyaltyDisabled: true })
    ).toBe('customer');
  });

  it('le programme prime sur le client quand les deux sont coupés', () => {
    expect(
      loyaltyFreezeReason({ enabled: false }, { loyaltyDisabled: true })
    ).toBe('program');
  });

  it('isLoyaltyActive est le miroir booléen', () => {
    expect(isLoyaltyActive({ enabled: true }, { loyaltyDisabled: false })).toBe(
      true
    );
    expect(isLoyaltyActive({ enabled: true }, { loyaltyDisabled: true })).toBe(
      false
    );
  });

  it('les messages disent quoi réactiver', () => {
    expect(loyaltyFrozenMessage('program')).toContain('Paramètres');
    expect(loyaltyFrozenMessage('customer')).toContain('fiche');
  });
});
