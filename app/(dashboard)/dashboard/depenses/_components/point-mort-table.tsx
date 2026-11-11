import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BreakEvenDay } from '@/lib/fixed-costs/compute';
import { formatDay, weekdayShort } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';

const fmt = new Intl.NumberFormat('fr-FR');
const f = (n: number | null) => (n === null ? '—' : fmt.format(n));

/** Un jour par ligne, le plus récent en haut ; jours fermés grisés. */
export function PointMortTable({ days }: { days: BreakEvenDay[] }) {
  const rows = [...days].reverse();
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jour</TableHead>
            <TableHead className="text-right">CA net</TableHead>
            <TableHead className="text-right">Charges</TableHead>
            <TableHead className="text-right">Point mort</TableHead>
            <TableHead className="text-right">Résultat</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.date} className={cn(!d.open && 'opacity-60')}>
              <TableCell className="whitespace-nowrap">
                {weekdayShort(d.date)} {formatDay(d.date)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {f(d.revenue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.open ? f(d.fixedCost) : '0'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {f(d.breakEven)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  d.result !== null &&
                    d.open &&
                    d.result < 0 &&
                    'text-destructive'
                )}
              >
                {d.open ? f(d.result) : '—'}
              </TableCell>
              <TableCell>
                {!d.open ? (
                  <Badge variant="secondary">Fermé</Badge>
                ) : d.reached === true ? (
                  <Badge>Atteint</Badge>
                ) : d.reached === false ? (
                  <Badge variant="outline">Non atteint</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
