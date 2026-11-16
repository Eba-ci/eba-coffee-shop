import { describe, expect, it } from 'vitest';
import type { CategoryHistory } from './history-detection';
import {
  startAfterFirstMonthNotice,
  suggestBackfill,
} from './backfill-suggestion';

const history = {
  categoryId: 'c',
  categoryName: 'Loyer',
  firstMonth: '2026-03',
  suggestedStartMonth: '2026-03',
  suggestedPeriodicity: 'MONTHLY',
  alreadyConverted: false,
  months: [
    { month: '2026-03', total: 100_000, count: 1 },
    { month: '2026-04', total: 150_000, count: 1 },
  ],
} as CategoryHistory;

describe('suggestBackfill', () => {
  it('propose le 1er du premier mois et le dernier total réel', () => {
    expect(suggestBackfill(history)).toMatchObject({
      label: 'Loyer',
      amount: 150_000,
      startDate: '2026-03-01',
      periodicity: 'MONTHLY',
    });
  });
});

describe('startAfterFirstMonthNotice', () => {
  it('avertit seulement si la prise d’effet dépasse le premier mois', () => {
    expect(startAfterFirstMonthNotice('2026-03-15', '2026-03')).toBeNull();
    expect(startAfterFirstMonthNotice('2026-05-01', '2026-03')).toMatch(
      /hors périmètre/
    );
  });
});
