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
vi.mock('../../salary-actions', () => ({
  convertOverpaymentToBonusAction: (...a: unknown[]) => action(...a),
}));

import { OverpaidBonusButton } from './overpaid-bonus-button';

const setup = () =>
  render(
    React.createElement(OverpaidBonusButton, {
      employeeId: 'e1',
      month: '2026-10',
      overpaid: 5000,
    })
  );
const button = () => screen.getByRole('button') as HTMLButtonElement;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  action.mockReset();
});

describe('OverpaidBonusButton', () => {
  it('garde la confirmation ouverte pendant l’attente, puis la ferme au succès', async () => {
    const d = deferred<{ ok: true }>();
    action.mockReturnValue(d.promise);
    setup();
    fireEvent.click(button());
    expect(button().textContent).toMatch(/Confirmer le bonus/);
    fireEvent.click(button());
    await waitFor(() => expect(button().disabled).toBe(true));
    expect(button().textContent).toMatch(/Confirmer le bonus/);
    d.resolve({ ok: true });
    await waitFor(() =>
      expect(button().textContent).toMatch(/Marquer comme bonus/)
    );
  });

  it('reste ouverte avec le message d’erreur à l’échec, effacé à la nouvelle tentative', async () => {
    action.mockResolvedValueOnce({ ok: false, error: 'Boum' });
    setup();
    fireEvent.click(button());
    fireEvent.click(button());
    await screen.findByText('Boum');
    expect(button().textContent).toMatch(/Confirmer le bonus/);
    expect(button().disabled).toBe(false);

    const d = deferred<{ ok: true }>();
    action.mockReturnValue(d.promise);
    fireEvent.click(button());
    await waitFor(() => expect(screen.queryByText('Boum')).toBeNull());
    d.resolve({ ok: true });
  });
});
