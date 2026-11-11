import { describe, expect, it } from 'vitest';
import {
  defaultInstallments,
  occurrencesInRange,
  scheduleForRange,
  statusOf,
  type LinkedPayment,
  type ScheduledCost,
} from './schedule';

const cost = (over: Partial<ScheduledCost> = {}): ScheduledCost => ({
  id: 'c1',
  label: 'Loyer',
  amount: 300000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [],
  ...over,
});

const pay = (over: Partial<LinkedPayment> = {}): LinkedPayment => ({
  expenseId: 'e1',
  fixedCostId: 'c1',
  dueDate: '2026-11-05',
  amount: 300000,
  ...over,
});

const dues = (
  c: ScheduledCost,
  from: string,
  to: string,
  today = '2026-11-11'
) => occurrencesInRange(c, from, to, [], today).map((o) => o.dueDate);

describe('échéance par défaut', () => {
  it('reprend le jour de la prise d’effet', () => {
    expect(defaultInstallments(cost())).toEqual([
      { monthOffset: 0, day: 5, amount: 300000 },
    ]);
    expect(
      defaultInstallments(
        cost({ periodicity: 'QUARTERLY', startDate: '2026-02-10' })
      )
    ).toEqual([{ monthOffset: 1, day: 10, amount: 300000 }]);
    expect(
      defaultInstallments(
        cost({ periodicity: 'YEARLY', startDate: '2026-09-15' })
      )
    ).toEqual([{ monthOffset: 8, day: 15, amount: 300000 }]);
    // 2026-11-08 est un dimanche → 7
    expect(
      defaultInstallments(
        cost({ periodicity: 'WEEKLY', startDate: '2026-11-08' })
      )
    ).toEqual([{ monthOffset: 0, day: 7, amount: 300000 }]);
  });

  it('une charge sans échéance saisie en produit une seule par mois', () => {
    expect(dues(cost(), '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
  });
});

describe('jour clampé au dernier jour du mois', () => {
  const c31 = cost({
    startDate: '2026-01-01',
    installments: [{ monthOffset: 0, day: 31, amount: 300000 }],
  });
  it.each([
    ['2026-02', '2026-02-28'], // 28 jours
    ['2028-02', '2028-02-29'], // 29 jours
    ['2026-04', '2026-04-30'], // 30 jours
    ['2026-05', '2026-05-31'], // 31 jours
  ])('%s → %s', (month, expected) => {
    expect(dues(c31, `${month}-01`, `${month}-${expected.slice(8)}`)).toEqual([
      expected,
    ]);
    // la veille du dernier jour, l'échéance n'est pas encore tombée
    expect(
      dues(c31, `${month}-01`, `${month}-${Number(expected.slice(8)) - 1}`)
    ).toEqual([]);
  });
});

describe('plusieurs échéances dans le mois', () => {
  const split = cost({
    installments: [
      { monthOffset: 0, day: 5, amount: 200000 },
      { monthOffset: 0, day: 20, amount: 100000 },
    ],
  });
  it('génère chaque échéance avec son montant', () => {
    const occ = occurrencesInRange(
      split,
      '2026-11-01',
      '2026-11-30',
      [],
      '2026-11-11'
    );
    expect(occ.map((o) => [o.dueDate, o.amount])).toEqual([
      ['2026-11-05', 200000],
      ['2026-11-20', 100000],
    ]);
  });
  it('un paiement lié ne règle que son échéance', () => {
    const occ = occurrencesInRange(
      split,
      '2026-11-01',
      '2026-11-30',
      [pay({ amount: 200000 })],
      '2026-11-11'
    );
    expect(occ.map((o) => o.status)).toEqual(['PAID', 'UPCOMING']);
  });
});

describe('fenêtre d’effet', () => {
  it('démarrage en cours de mois : l’échéance avant la prise d’effet est ignorée', () => {
    const c = cost({ startDate: '2026-11-20' });
    // échéance par défaut = 20 → comptée
    expect(dues(c, '2026-11-01', '2026-11-30')).toEqual(['2026-11-20']);
    const custom = cost({
      startDate: '2026-11-20',
      installments: [{ monthOffset: 0, day: 5, amount: 300000 }],
    });
    expect(dues(custom, '2026-11-01', '2026-12-31')).toEqual(['2026-12-05']);
  });
  it('fin en cours de mois : l’échéance après la fin est ignorée', () => {
    const c = cost({
      endDate: '2026-11-04',
      installments: [{ monthOffset: 0, day: 5, amount: 300000 }],
    });
    expect(dues(c, '2026-10-01', '2026-12-31')).toEqual(['2026-10-05']);
  });
  it('charge inactive ou par jour ouvré : aucune occurrence', () => {
    expect(dues(cost({ active: false }), '2026-11-01', '2026-11-30')).toEqual(
      []
    );
    expect(
      dues(cost({ periodicity: 'DAILY' }), '2026-11-01', '2026-11-30')
    ).toEqual([]);
  });
});

describe('trimestre, année, semaine', () => {
  it('trimestriel : seulement dans le bon mois du trimestre', () => {
    const q = cost({
      periodicity: 'QUARTERLY',
      startDate: '2026-01-10',
      installments: [{ monthOffset: 1, day: 10, amount: 900000 }],
    });
    expect(dues(q, '2026-01-01', '2026-12-31')).toEqual([
      '2026-02-10',
      '2026-05-10',
      '2026-08-10',
      '2026-11-10',
    ]);
    expect(dues(q, '2026-12-01', '2026-12-31')).toEqual([]);
  });
  it('annuel : une seule fois dans l’année', () => {
    const y = cost({
      periodicity: 'YEARLY',
      startDate: '2025-03-01',
      installments: [{ monthOffset: 2, day: 31, amount: 1200000 }],
    });
    expect(dues(y, '2026-01-01', '2026-12-31')).toEqual(['2026-03-31']);
    expect(dues(y, '2026-04-01', '2026-12-31')).toEqual([]);
  });
  it('hebdomadaire : un jour de semaine fixe (lundi = 1)', () => {
    const w = cost({
      periodicity: 'WEEKLY',
      startDate: '2026-11-02',
      installments: [{ monthOffset: 0, day: 5, amount: 50000 }], // vendredi
    });
    expect(dues(w, '2026-11-02', '2026-11-15')).toEqual([
      '2026-11-06',
      '2026-11-13',
    ]);
  });
  it('échéance hors période (monthOffset trop grand) ignorée', () => {
    const q = cost({
      periodicity: 'QUARTERLY',
      installments: [{ monthOffset: 3, day: 1, amount: 1 }],
    });
    expect(dues(q, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('statut d’une occurrence', () => {
  it('payée / partielle / en retard / à venir', () => {
    expect(statusOf('2026-11-05', 1000, 1000, '2026-11-11')).toBe('PAID');
    expect(statusOf('2026-11-05', 1000, 1500, '2026-11-11')).toBe('PAID');
    expect(statusOf('2026-11-05', 1000, 400, '2026-11-11')).toBe('PARTIAL');
    expect(statusOf('2026-11-05', 1000, 0, '2026-11-11')).toBe('LATE');
    expect(statusOf('2026-11-20', 1000, 0, '2026-11-11')).toBe('UPCOMING');
  });
  it('le jour même n’est jamais en retard', () => {
    expect(statusOf('2026-11-11', 1000, 0, '2026-11-11')).toBe('UPCOMING');
  });
  it('plusieurs dépenses liées s’additionnent', () => {
    const occ = occurrencesInRange(
      cost(),
      '2026-11-01',
      '2026-11-30',
      [
        pay({ expenseId: 'a', amount: 100000 }),
        pay({ expenseId: 'b', amount: 200000 }),
      ],
      '2026-11-11'
    );
    expect(occ[0]).toMatchObject({
      paid: 300000,
      remaining: 0,
      status: 'PAID',
      expenseIds: ['a', 'b'],
    });
  });
  it('une dépense liée à une autre charge ou une autre date ne compte pas', () => {
    const occ = occurrencesInRange(
      cost(),
      '2026-11-01',
      '2026-11-30',
      [pay({ fixedCostId: 'autre' }), pay({ dueDate: '2026-10-05' })],
      '2026-11-11'
    );
    expect(occ[0].status).toBe('LATE');
  });
  it('deux charges de même catégorie ne se confondent pas', () => {
    const a = cost({ id: 'a', label: 'Loyer A' });
    const b = cost({ id: 'b', label: 'Loyer B' });
    const occ = scheduleForRange(
      [a, b],
      '2026-11-01',
      '2026-11-30',
      [pay({ fixedCostId: 'a' })],
      '2026-11-11'
    );
    expect(occ.map((o) => [o.label, o.status])).toEqual([
      ['Loyer A', 'PAID'],
      ['Loyer B', 'LATE'],
    ]);
  });
});
