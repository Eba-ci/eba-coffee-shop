'use client';

import { useState, useTransition } from 'react';
import { Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConfirmDialog } from '../_components/use-confirm-dialog';
import { cancelRestockBatchAction } from './actions';

const f = new Intl.NumberFormat('fr-FR');

type Batch = {
  id: string;
  date: string;
  supplier: string | null;
  source: string;
  lineCount: number;
  total: number;
  receiptNo: string | null;
  canceled: boolean;
  by: string | null;
};

export function RestockBatches({ batches }: { batches: Batch[] }) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    const confirmed = await confirm({
      title: 'Annuler ce lot de réappro',
      message:
        'Le stock et le PMP seront restaurés à leur état d’avant réception, et la dépense liée supprimée. L’opération est définitive.',
      confirmLabel: 'Annuler le lot',
      destructive: true,
    });
    if (!confirmed) return;
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await cancelRestockBatchAction(id);
      setBusyId(null);
      if (res.ok) {
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Lots de réappro</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun lot de réappro.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Lignes</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Reçu</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow
                    key={b.id}
                    className={b.canceled ? 'opacity-50' : ''}
                  >
                    <TableCell>{b.date}</TableCell>
                    <TableCell>{b.supplier || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {b.source === 'IMPORT' ? 'Import' : 'Manuel'}
                      </Badge>
                    </TableCell>
                    <TableCell>{f.format(b.lineCount)}</TableCell>
                    <TableCell>{f.format(b.total)} F</TableCell>
                    <TableCell>{b.receiptNo || '—'}</TableCell>
                    <TableCell>
                      {b.canceled ? (
                        <Badge variant="secondary">Annulé</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending && busyId === b.id}
                          onClick={() => handleCancel(b.id)}
                        >
                          <Undo2 className="h-4 w-4" />
                          Annuler le lot
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </>
  );
}
