'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/(dashboard)/confirm-dialog';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import { formatLocalDateOnly } from '@/lib/timezone';
import {
  createProductWeeklySpecialAction,
  deleteProductWeeklySpecialAction,
} from '../../../actions';

export type WeeklySpecialRow = {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
};

function statusOf(
  s: { startDate: string; endDate: string },
  today: string
): 'active' | 'upcoming' | 'past' {
  if (s.startDate <= today && today <= s.endDate) return 'active';
  if (s.startDate > today) return 'upcoming';
  return 'past';
}

export function WeeklySpecialField({
  productId,
  initialSpecials,
}: {
  productId: string;
  initialSpecials: WeeklySpecialRow[];
}) {
  const { pushToast } = useUndoToast();
  const [pendingDelete, setPendingDelete] = useState<WeeklySpecialRow | null>(
    null
  );
  const [specials, setSpecials] = useState(initialSpecials);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = formatLocalDateOnly(new Date());

  function quickFillNextWeek() {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    setStartDate(formatLocalDateOnly(start));
    setEndDate(formatLocalDateOnly(end));
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createProductWeeklySpecialAction(productId, {
        startDate,
        endDate,
        note: note.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        pushToast(result.error, 'error');
        return;
      }
      setStartDate('');
      setEndDate('');
      setNote('');
      pushToast('Spécialité de la semaine programmée');
    });
  }

  function handleDelete() {
    const target = pendingDelete;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteProductWeeklySpecialAction(target.id);
      setPendingDelete(null);
      if (!result.ok) {
        pushToast(result.error, 'error');
        return;
      }
      setSpecials((prev) => prev.filter((s) => s.id !== target.id));
      pushToast('Fenêtre retirée');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spécialité de la semaine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Dès qu’une fenêtre est programmée ci-dessous, le produit n’est
          commandable QUE durant cette période — en dehors, il reste visible
          avec un badge « Revient le … » et son prix est masqué. Peut être
          reconduit plus tard : l’historique des passages est conservé.
        </p>

        {specials.length > 0 && (
          <div className="space-y-1.5">
            {specials.map((s) => {
              const status = statusOf(s, today);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {s.startDate} → {s.endDate}
                    </span>
                    {status === 'active' && (
                      <span className="ml-2 text-xs font-semibold text-green-600">
                        En cours
                      </span>
                    )}
                    {status === 'upcoming' && (
                      <span className="ml-2 text-xs font-semibold text-amber-600">
                        À venir
                      </span>
                    )}
                    {status === 'past' && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Passée
                      </span>
                    )}
                    {s.note && (
                      <p className="text-xs text-muted-foreground">{s.note}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isPending}
                    onClick={() => setPendingDelete(s)}
                    aria-label="Retirer cette fenêtre"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ws-start" className="text-xs">
              Début
            </Label>
            <Input
              id="ws-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-auto"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ws-end" className="text-xs">
              Fin
            </Label>
            <Input
              id="ws-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-auto"
              disabled={isPending}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={quickFillNextWeek}
            disabled={isPending}
          >
            +7 jours
          </Button>
          <Input
            placeholder="Note (optionnel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-48"
            disabled={isPending}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending || !startDate || !endDate}
            onClick={handleCreate}
          >
            Programmer
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Retirer cette fenêtre ?"
          description={
            pendingDelete
              ? `La période ${pendingDelete.startDate} → ${pendingDelete.endDate} sera retirée de l’historique.`
              : ''
          }
          confirmLabel="Retirer"
          destructive
          isPending={isPending}
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  );
}
