// Boutons d'écriture de la fiche employé (#441) : ils vivent dans l'en-tête,
// les champs seulement dans les tiroirs. Fermés, les tiroirs ne rendent rien :
// la fiche ne contient donc aucun champ de saisie.

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../actions', () => ({
  addSalaryRateAction: vi.fn(),
  recordEmployeeExitAction: vi.fn(),
  updateEmployeeIdentityAction: vi.fn(),
}));

import { EmployeeDetailActions } from './employee-detail-actions';

const employee = {
  id: 'e1',
  name: 'Awa Traoré',
  position: 'Barista',
  startDate: '2025-01-06',
  endDate: null,
  active: true,
  note: null,
  rates: [{ monthlyAmount: 150_000, startDate: '2025-01-06' }],
};

const noField = /<(input|textarea|select|form)[\s>]/i;

describe('fiche Employé : actions dans l’en-tête, aucun champ au repos', () => {
  it('affiche les trois actions et aucun champ', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeeDetailActions, {
        employee,
        today: '2026-11-14',
      })
    );
    expect(html).toContain('Modifier');
    expect(html).toContain('Enregistrer une sortie');
    expect(html).toContain('Nouveau taux');
    expect(html).not.toMatch(noField);
  });

  it('la sortie est indisponible pour un employé déjà sorti', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeeDetailActions, {
        employee: { ...employee, active: false, endDate: '2026-10-31' },
        today: '2026-11-14',
      })
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Enregistrer une sortie/s);
  });
});
