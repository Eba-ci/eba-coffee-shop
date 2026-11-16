// Carte « Historique des paiements » de l'onglet Paiements (#454) : une ligne
// par charge, une colonne par mois, pour répondre à « quels mois n'ont reçu
// aucun paiement ? ». Une seule lecture pour toute la plage.

import { clampHistoryMonths } from '@/lib/fixed-costs/history-grid-ranges';
import { getFixedCostHistoryGrid } from '@/lib/fixed-costs/history-grid-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HistoryGridControls } from './history-grid-controls';
import { HistoryGridView } from './history-grid-view';

export async function HistoryGridSection({
  months,
  onlyUnpaid,
}: {
  months?: number | null;
  onlyUnpaid?: boolean | null;
}) {
  const count = clampHistoryMonths(months);
  const grid = await getFixedCostHistoryGrid({
    months: count,
    onlyUnpaid: !!onlyUnpaid,
  });
  return (
    <Card id="historique-paiements">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Historique des paiements</CardTitle>
        <HistoryGridControls months={count} onlyUnpaid={!!onlyUnpaid} />
      </CardHeader>
      <CardContent>
        <HistoryGridView grid={grid} />
      </CardContent>
    </Card>
  );
}
