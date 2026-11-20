'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Search, X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  renameExpenseArticleAction,
  archiveExpenseArticleAction,
} from './actions';
import type {
  ArticleMeta,
  ArticleStatRow,
  InventoryItemOption,
} from './_components/articles/types';
import { priceFmt, qtyFmt } from './_components/articles/format';
import { ArticleSettingsSheet } from './_components/articles/article-settings-sheet';
import { ArticleRowActions } from './_components/articles/article-row-actions';
import { ArticleMergeSheet } from './_components/articles/article-merge-sheet';

export type { ArticleMeta, ArticleStatRow, InventoryItemOption };

/** Fréquence d'achat par article sur la sélection courante ; les actions d'administration opèrent sur tout le référentiel (`articlesMeta`). */
export function ArticlesTable({
  stats,
  articlesMeta,
  inventoryItems,
}: {
  stats: ArticleStatRow[];
  articlesMeta: ArticleMeta[];
  inventoryItems: InventoryItemOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const metaById = useMemo(
    () => new Map(articlesMeta.map((a) => [a.id, a])),
    [articlesMeta]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stats;
    return stats.filter((s) => s.name.toLowerCase().includes(q));
  }, [stats, query]);

  function openHistory(articleId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('article', articleId);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const r = await renameExpenseArticleAction(id, { name });
      if (!r.ok) setError(r.error);
      else {
        setEditingId(null);
      }
    });
  }

  function archive(id: string, name: string) {
    if (!window.confirm(`Retirer « ${name} » du référentiel d'articles ?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await archiveExpenseArticleAction(id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un article (ex. farine)"
          className="pl-8"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead className="text-right">Achats</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Qté totale</TableHead>
              <TableHead className="text-right">Qté / mois</TableHead>
              <TableHead className="text-right">PU moyen</TableHead>
              <TableHead>Dernier achat</TableHead>
              <TableHead className="text-right">Intervalle moyen</TableHead>
              <TableHead className="text-right">Cadence / mois</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.articleId}>
                <TableCell className="font-medium">
                  {editingId === s.articleId ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && saveRename(s.articleId)
                        }
                        className="h-8 max-w-[200px]"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => saveRename(s.articleId)}
                        disabled={pending}
                        aria-label="Valider"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setEditingId(null)}
                        aria-label="Annuler"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {s.name}
                      {metaById.get(s.articleId)?.trackInventory && (
                        <span aria-hidden title="Suivi de stock">
                          📦
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.purchaseCount}×
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {priceFmt.format(s.totalAmount)} F
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.totalQtyBase != null
                    ? `${qtyFmt.format(s.totalQtyBase)} ${s.baseUnit ?? ''}`.trim()
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.monthlyAvgQtyBase != null
                    ? `${qtyFmt.format(s.monthlyAvgQtyBase)} ${s.baseUnit ?? ''}`.trim()
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.avgUnitPrice != null
                    ? `${priceFmt.format(s.avgUnitPrice)} F${
                        s.baseUnit ? `/${s.baseUnit}` : ''
                      }`
                    : '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-sm">
                  {s.lastPurchaseDate ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.avgIntervalDays != null ? `${s.avgIntervalDays} j` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.monthlyAvgCount}×
                </TableCell>
                <ArticleRowActions
                  name={s.name}
                  hasMeta={metaById.has(s.articleId)}
                  pending={pending}
                  onHistory={() => openHistory(s.articleId)}
                  onRename={() => {
                    setEditingId(s.articleId);
                    setEditName(s.name);
                  }}
                  onSettings={() => setSettingsId(s.articleId)}
                  onMerge={() => setMergeId(s.articleId)}
                  onArchive={() => archive(s.articleId, s.name)}
                />
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {stats.length === 0
                    ? 'Aucune dépense détaillée sur cette sélection — détaille les articles à la saisie pour alimenter ces statistiques.'
                    : 'Aucun article ne correspond à la recherche.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {settingsId && metaById.has(settingsId) && (
        <ArticleSettingsSheet
          article={metaById.get(settingsId)!}
          inventoryItems={inventoryItems}
          linkedElsewhere={
            new Set(
              articlesMeta
                .filter((a) => a.id !== settingsId && a.inventoryItemId)
                .map((a) => a.inventoryItemId!)
            )
          }
          onClose={() => setSettingsId(null)}
        />
      )}

      {mergeId && metaById.has(mergeId) && (
        <ArticleMergeSheet
          source={metaById.get(mergeId)!}
          targets={articlesMeta.filter((a) => a.id !== mergeId)}
          onClose={() => setMergeId(null)}
        />
      )}
    </div>
  );
}
