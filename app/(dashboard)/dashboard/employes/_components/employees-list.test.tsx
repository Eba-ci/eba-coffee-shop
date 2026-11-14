// Rendu de la liste Employés (#441) : les seules commandes d'écriture sont des
// boutons ; aucun champ de saisie n'existe tant qu'un tiroir reste fermé.

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../actions', () => ({ createEmployeeAction: vi.fn() }));

import type { EmployeeListRow } from '@/lib/employees/queries';
import { EmployeesList } from './employees-list';

const row: EmployeeListRow = {
  id: 'e1',
  name: 'Awa Traoré',
  position: 'Barista',
  active: true,
  startDate: '2025-01-06',
  endDate: null,
  currentRate: 150_000,
  month: {
    due: 150_000,
    salariesPaid: 100_000,
    advancesPaid: 0,
    advanceRecovered: 0,
    paid: 100_000,
    remainingToPay: 50_000,
  },
  arrearsTotal: 0,
};

const noField = /<(input|textarea|select|form)[\s>]/i;

describe('liste Employés : aucun champ de saisie hors tiroir', () => {
  it('liste avec un employé', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeesList, {
        overview: { month: '2026-11', employees: [row] },
        today: '2026-11-14',
      })
    );
    expect(html).toContain('Awa Traoré');
    expect(html).toContain('Mois non soldé');
    expect(html).not.toMatch(noField);
  });

  it('état vide : icône, phrase et action', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeesList, {
        overview: { month: '2026-11', employees: [] },
        today: '2026-11-14',
      })
    );
    expect(html).toContain('Aucun employé enregistré');
    expect(html).toContain('Créer un employé');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(noField);
  });
});
