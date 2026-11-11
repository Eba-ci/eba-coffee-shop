import { describe, expect, it } from 'vitest';
import { installmentsError } from './installments';

const i = (monthOffset: number, day: number, amount: number) => ({
  monthOffset,
  day,
  amount,
});

describe('installmentsError', () => {
  it('aucune échéance : valide (défaut à la lecture)', () => {
    expect(installmentsError('MONTHLY', 1000, [])).toBeNull();
  });
  it('total différent du montant', () => {
    expect(installmentsError('MONTHLY', 1000, [i(0, 5, 400)])).toMatch(/total/);
    expect(
      installmentsError('MONTHLY', 1000, [i(0, 5, 400), i(0, 20, 600)])
    ).toBeNull();
  });
  it('jours et mois hors bornes', () => {
    expect(installmentsError('MONTHLY', 1, [i(0, 32, 1)])).toMatch(/Jour/);
    expect(installmentsError('WEEKLY', 1, [i(0, 8, 1)])).toMatch(/semaine/);
    expect(installmentsError('MONTHLY', 1, [i(1, 5, 1)])).toMatch(/hors/);
    expect(installmentsError('QUARTERLY', 1, [i(3, 5, 1)])).toMatch(/hors/);
    expect(installmentsError('YEARLY', 1, [i(11, 5, 1)])).toBeNull();
  });
  it('doublon et charge par jour ouvré', () => {
    expect(installmentsError('MONTHLY', 2, [i(0, 5, 1), i(0, 5, 1)])).toMatch(
      /même jour/
    );
    expect(installmentsError('DAILY', 1, [i(0, 5, 1)])).toMatch(/jour ouvré/);
  });
});
