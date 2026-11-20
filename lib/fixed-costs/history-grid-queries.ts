// lib/fixed-costs/history-grid-queries.ts
//
// Lecture de la vue historique charge × mois (#454) : DEUX requêtes pour toute
// la plage (les charges avec échéances, puis les dépenses liées de la plage),
// jamais une par mois. Les charges inactives restent visibles sur leur période
// d'activité ; les charges « par jour ouvré » n'ont pas d'échéance et n'y
// figurent pas. Aucune donnée de salaire.

import { todayDateString } from '@/lib/timezone';
import { buildHistoryGrid, monthRange, type HistoryGrid } from './history-grid';
import { clampHistoryMonths } from './history-grid-ranges';
import { monthBounds } from './month';
import { listFixedCosts, listLinkedPayments } from './payments-queries';
import { isSalaryNamed } from './salary-migration';
import { scheduleForRange } from './schedule';

export async function getFixedCostHistoryGrid(opts: {
  months?: number;
  onlyUnpaid?: boolean;
}): Promise<HistoryGrid> {
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);
  const months = monthRange(currentMonth, clampHistoryMonths(opts.months));
  const from = monthBounds(months[0]).from;
  const to = monthBounds(months[months.length - 1]).to;

  const costs = (await listFixedCosts()).filter(
    (c) =>
      c.periodicity !== 'DAILY' &&
      !isSalaryNamed({ label: c.label, categoryName: c.categoryName })
  );
  const payments = await listLinkedPayments(from, to);
  // `active: true` pour le calcul : une charge désactivée garde ses échéances
  // sur sa fenêtre (début → fin), elle est seulement grisée à l'écran.
  const occurrences = scheduleForRange(
    costs.map((c) => ({ ...c, active: true })),
    from,
    to,
    payments,
    today
  );
  return buildHistoryGrid(
    costs.map((c) => ({
      id: c.id,
      label: c.label,
      inactive: !c.active,
      startDate: c.startDate,
      endDate: c.endDate,
    })),
    occurrences,
    months,
    currentMonth,
    { onlyUnpaid: opts.onlyUnpaid }
  );
}
