'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { mergeArticlesAction } from '../../actions';
import type { ArticleMeta } from './types';
import { selectClass } from './format';

/** Fusion de deux articles en double, avec aperçu du nombre de lignes rattachées à la cible. */
export function ArticleMergeSheet({
  source,
  targets,
  onClose,
}: {
  source: ArticleMeta;
  targets: ArticleMeta[];
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const target = targets.find((t) => t.id === targetId);

  function confirm() {
    if (!targetId) return;
    setError(null);
    startTransition(async () => {
      const r = await mergeArticlesAction(source.id, targetId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Fusionner « {source.name} »</SheetTitle>
          <SheetDescription>
            Dédoublonnage : toutes les lignes de dépense de « {source.name} »
            seront rattachées à l’article choisi, qui remplace « {source.name}»
            (archivé, jamais supprimé).
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun autre article actif vers lequel fusionner.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="merge-target">Fusionner vers</Label>
                <select
                  id="merge-target"
                  className={selectClass}
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {target && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {source.itemsCount} ligne{source.itemsCount > 1 ? 's' : ''}{' '}
                  seront rattachée{source.itemsCount > 1 ? 's' : ''} à «{' '}
                  {target.name} ».
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={confirm} disabled={pending || !targetId}>
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirmer la fusion
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
