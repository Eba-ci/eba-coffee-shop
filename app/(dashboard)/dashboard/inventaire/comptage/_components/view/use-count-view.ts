'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemView } from '@/lib/inventory';
import { useSearchHits } from '@/lib/hooks/use-search-hits';
import { itemsByHits } from '@/lib/search/rank';
import {
  countEntered,
  draftToLines,
  parseCountValue,
} from '@/lib/inventory-count-draft';
import {
  useInventoryCountHydration,
  useInventoryCountStore,
} from '@/lib/hooks/use-inventory-count';
import { recordInventoryCountAction } from '../../../actions';
import { EMPTY_COUNTS, UNCATEGORIZED, type Filter } from './constants';

export type CountViewState = ReturnType<typeof useCountView>;

export function useCountView(items: InventoryItemView[]) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasHydrated = useInventoryCountHydration();
  const draft = useInventoryCountStore((s) => s.draft);
  const start = useInventoryCountStore((s) => s.start);
  const setCount = useInventoryCountStore((s) => s.setCount);
  const clear = useInventoryCountStore((s) => s.clear);

  const [search, setSearch] = useState('');
  const [zone, setZone] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('todo');
  const [recapOpen, setRecapOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instantané des saisies au moment du DERNIER geste de sélection.
  //
  // C'est ce qui empêche la liste de se recomposer sous le pouce : avec le
  // filtre « À compter », une carte qui disparaît à la seconde où on tape son
  // chiffre fait remonter la suivante sous le doigt, et casse l'enchaînement au
  // clavier en plein milieu. La sélection ne bouge donc que sur un geste
  // explicite — changer de zone, de filtre ou de recherche.
  const [snapshot, setSnapshot] = useState<Record<string, string>>({});

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Identité stable : `draft?.counts ?? {}` recrée un objet vide à chaque rendu
  // et ferait recalculer les compteurs de zone pour rien.
  const counts = useMemo(() => draft?.counts ?? EMPTY_COUNTS, [draft]);
  const entered = countEntered(counts);

  // Tri par catégorie puis nom : c'est l'ordre dans lequel on marche dans la
  // réserve, et celui que `listInventoryItems` renvoie déjà.
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const byCat = (a.category ?? UNCATEGORIZED).localeCompare(
          b.category ?? UNCATEGORIZED,
          'fr'
        );
        return byCat !== 0 ? byCat : a.name.localeCompare(b.name, 'fr');
      }),
    [items]
  );

  const zones = useMemo(() => {
    const byZone = new Map<string, { total: number; done: number }>();
    for (const item of sorted) {
      const key = item.category ?? UNCATEGORIZED;
      const acc = byZone.get(key) ?? { total: 0, done: 0 };
      acc.total++;
      if (parseCountValue(counts[item.id]) !== null) acc.done++;
      byZone.set(key, acc);
    }
    return Array.from(byZone, ([name, stats]) => ({ name, ...stats }));
  }, [sorted, counts]);

  // Recherche faite par la base (pg_trgm) ; la saisie reste locale.
  const { hits } = useSearchHits('/api/inventory/search', search);

  const visible = useMemo(() => {
    const base = hits ? itemsByHits(sorted, hits) : sorted;
    return base.filter((item) => {
      if (zone !== 'all' && (item.category ?? UNCATEGORIZED) !== zone) {
        return false;
      }
      const counted = parseCountValue(snapshot[item.id]);
      if (filter === 'todo' && counted !== null) return false;
      if (
        filter === 'diff' &&
        (counted === null || counted === item.currentQuantity)
      ) {
        return false;
      }
      return true;
    });
  }, [sorted, hits, zone, filter, snapshot]);

  /** Tout changement de sélection re-photographie les saisies du moment. */
  function selectZone(next: string) {
    setSnapshot(counts);
    setZone(next);
  }
  function selectFilter(next: Filter) {
    setSnapshot(counts);
    setFilter(next);
  }
  function selectSearch(next: string) {
    setSnapshot(counts);
    setSearch(next);
  }

  function focusNext(index_: number) {
    for (let i = index_ + 1; i < inputRefs.current.length; i++) {
      const el = inputRefs.current[i];
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  }

  function handleSubmit() {
    if (!draft) return;
    setError(null);
    const lines = draftToLines(
      draft.counts,
      sorted.map((it) => it.id)
    );
    if (lines.length === 0) return;

    startTransition(async () => {
      const result = await recordInventoryCountAction({
        date: draft.date,
        label: draft.label.trim() || undefined,
        lines,
      });
      if (result.ok) {
        // Le brouillon n'est vidé qu'après confirmation du serveur : un échec
        // réseau dans la réserve est précisément le moment où il sert.
        clear();
        setRecapOpen(false);
        router.push('/dashboard/inventaire?compte=1');
      } else {
        setError(result.error);
      }
    });
  }

  return {
    isPending,
    hasHydrated,
    draft,
    start,
    setCount,
    search,
    zone,
    filter,
    recapOpen,
    setRecapOpen,
    error,
    inputRefs,
    counts,
    entered,
    sorted,
    zones,
    visible,
    selectZone,
    selectFilter,
    selectSearch,
    focusNext,
    handleSubmit,
  };
}
