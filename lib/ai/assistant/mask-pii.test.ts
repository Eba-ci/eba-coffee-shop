import { describe, expect, it } from 'vitest';
import { maskPhone, maskPhonesDeep, maskPiiDeep } from './mask-pii';

describe('maskPhonesDeep', () => {
  it('masque les clés téléphone à tous les niveaux et garde les ids', () => {
    const out = maskPhonesDeep({
      customers: [
        { id: 'c1', name: 'Awa', phone: '+2250712345678', total: 5000 },
      ],
      order: { customerPhone: '07 12 34 56 78', driverPhone: null },
    });
    expect(out).toEqual({
      customers: [{ id: 'c1', name: 'Awa', phone: '****78', total: 5000 }],
      order: { customerPhone: '****78', driverPhone: null },
    });
  });

  it('ne laisse jamais le numéro complet dans la sortie', () => {
    expect(
      JSON.stringify(maskPhonesDeep({ phone: '+2250712345678' }))
    ).not.toContain('0712345678');
    expect(maskPhone('12')).toBe('****');
  });
});

describe('maskPiiDeep', () => {
  it('retire en bloc toute charge utile employé / paie', () => {
    const out = maskPiiDeep({
      employees: [{ name: 'Awa', salary: 250_000 }],
      salaryMonthView: { employees: [], totals: { due: 1_000 } },
      payroll: { net: 900 },
      customer: { name: 'Koffi', phone: '+2250700000000' },
    }) as Record<string, unknown>;
    expect(out.employees).toBe('****');
    expect(out.salaryMonthView).toBe('****');
    expect(out.payroll).toBe('****');
    // Hors paie : le nom du client reste (déjà la règle), le téléphone est masqué.
    expect(out.customer).toEqual({ name: 'Koffi', phone: '****00' });
  });

  it('ne laisse ni nom d’employé ni montant individuel dans la sortie', () => {
    const json = JSON.stringify(
      maskPiiDeep({
        employees: [{ name: 'Awa Traoré', monthlyAmount: 250_000 }],
      })
    );
    expect(json).not.toContain('Awa');
    expect(json).not.toContain('250000');
  });
});
