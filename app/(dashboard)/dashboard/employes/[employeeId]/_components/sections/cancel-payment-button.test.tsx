// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const action = vi.fn();
vi.mock('../../../salary-actions', () => ({
  cancelSalaryPaymentAction: (...a: unknown[]) => action(...a),
}));

import { CancelPaymentButton } from './cancel-payment-button';

afterEach(() => {
  cleanup();
  action.mockReset();
});

describe('CancelPaymentButton', () => {
  it('ferme le dialogue au succès ; l’erreur est effacée à la réouverture', async () => {
    action.mockResolvedValueOnce({ ok: false, error: 'Refusé' });
    render(React.createElement(CancelPaymentButton, { paymentId: 'p1' }));
    fireEvent.click(screen.getByText('Annuler'));
    fireEvent.change(screen.getByLabelText('Motif de l’annulation'), {
      target: { value: 'erreur de saisie' },
    });
    fireEvent.click(screen.getByText('Annuler le versement'));
    await screen.findByText('Refusé');

    fireEvent.click(screen.getByText('Garder'));
    fireEvent.click(screen.getByText('Annuler'));
    expect(screen.queryByText('Refusé')).toBeNull();

    action.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByText('Annuler le versement'));
    await waitFor(() =>
      expect(screen.queryByLabelText('Motif de l’annulation')).toBeNull()
    );
  });
});
