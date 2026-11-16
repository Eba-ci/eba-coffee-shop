'use client';

// Ce que le brouillon doit dire en se réveillant.
//
// Un comptage repris deux jours plus tard porte une date qui n'est plus celle du
// jour, et le catalogue a pu bouger entre-temps. Aucun de ces deux cas ne doit
// être réglé en silence : re-dater les saisies tout seul falsifierait le
// registre, et jeter le brouillon parce qu'une référence a été créée ferait
// perdre vingt minutes de travail. On montre, et on laisse trancher.

import { useEffect, useState } from 'react';
import { CalendarClock, Info } from 'lucide-react';

import type { InventoryItemView } from '@/lib/inventory';
import type { CountDraft } from '@/lib/inventory-count-draft';
import { useInventoryCountStore } from '@/lib/hooks/use-inventory-count';
import { todayDateString } from '@/lib/timezone';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
});

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export function DraftBanner({
  draft,
  items,
}: {
  draft: CountDraft;
  items: InventoryItemView[];
}) {
  const reconcile = useInventoryCountStore((s) => s.reconcile);
  const setDate = useInventoryCountStore((s) => s.setDate);
  const [notice, setNotice] = useState<string | null>(null);

  // Réaccord une seule fois par montage, sur la liste servie par le serveur.
  useEffect(() => {
    const result = reconcile(
      items.map((it) => ({ id: it.id, currentQuantity: it.currentQuantity }))
    );
    if (!result) return;
    const parts: string[] = [];
    if (result.removedIds.length > 0) {
      parts.push(
        `${result.removedIds.length} référence(s) archivée(s) depuis — leurs saisies ont été retirées`
      );
    }
    if (result.addedIds.length > 0) {
      parts.push(
        `${result.addedIds.length} nouvelle(s) référence(s) à compter`
      );
    }
    if (result.movedIds.length > 0) {
      parts.push(
        `${result.movedIds.length} référence(s) réapprovisionnée(s) depuis votre saisie`
      );
    }
    setNotice(parts.length > 0 ? parts.join(' · ') : null);
    // `items` change d'identité à chaque rendu serveur (revalidation) : on ne réaccorde
    // qu'au montage, le brouillon n'ayant pas à bouger entre deux rendus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = todayDateString();
  const outdated = draft.date !== today;

  if (!outdated && !notice) return null;

  return (
    <div className="space-y-2">
      {outdated && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <CalendarClock className="size-4 shrink-0" />
          <span className="flex-1">
            Comptage daté du {formatDay(draft.date)}.
          </span>
          <button
            type="button"
            onClick={() => setDate(today)}
            className="h-9 rounded-md border border-amber-400 px-3 font-medium transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            Passer au {formatDay(today)}
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}
