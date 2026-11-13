import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/pickup-settings';
import { isClosedByOverride, setTodayClosed } from './pickup-today-toggle';

const D = '2026-11-12';

describe('setTodayClosed', () => {
  it("ferme aujourd'hui, remplace une exception existante", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      dateOverrides: [
        { date: D, closed: false, ranges: [{ start: '08:00', end: '23:00' }] },
        { date: '2026-12-25', closed: true, ranges: [] },
      ],
    };
    const next = setTodayClosed(s, D, true);
    expect(isClosedByOverride(next, D)).toBe(true);
    expect(next.dateOverrides).toHaveLength(2);
  });

  it("rouvre en supprimant l'exception du jour seulement", () => {
    const closed = setTodayClosed(
      {
        ...DEFAULT_SETTINGS,
        dateOverrides: [{ date: '2026-12-25', closed: true, ranges: [] }],
      },
      D,
      true
    );
    const open = setTodayClosed(closed, D, false);
    expect(isClosedByOverride(open, D)).toBe(false);
    expect(open.dateOverrides).toEqual([
      { date: '2026-12-25', closed: true, ranges: [] },
    ]);
  });
});
