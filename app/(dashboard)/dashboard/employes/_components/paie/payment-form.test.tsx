import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../salary-actions', () => ({ recordSalaryPaymentAction: vi.fn() }));

import { SalaryPaymentForm } from './payment-form';
import { SALARY_PAYMENT_METHOD_LABELS } from './format';

/**
 * Décision produit : en pratique la paie se fait par Wave, le mode de paiement
 * par défaut du formulaire de versement est donc WAVE (pas CASH). Le champ
 * reste modifiable (CASH, WAVE, BANK, OTHER).
 */
describe('formulaire de versement — mode de paiement par défaut', () => {
  it('propose WAVE comme valeur initiale', () => {
    const html = renderToStaticMarkup(
      React.createElement(SalaryPaymentForm, {
        employees: [{ id: 'e1', name: 'Aïcha' }],
        defaultMonth: '2026-11',
        today: '2026-11-11',
      })
    );
    expect(html).toContain(SALARY_PAYMENT_METHOD_LABELS.WAVE);
    expect(html).not.toContain(SALARY_PAYMENT_METHOD_LABELS.CASH);
  });
});
