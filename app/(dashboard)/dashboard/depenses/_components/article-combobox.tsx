'use client';

// Champ UNIQUE de choix d'article : il liste les articles existants dès
// l'ouverture (triés par usage), filtre à la frappe via la base (`lib/search/trgm.ts`),
// et propose la création quand le nom saisi n'existe pas encore.
//
// Auto-suffisant : dropdown en `absolute`, pas de portal. C'est le pattern des
// autres comboboxes du repo (`InventoryRefCombobox`, `customer-search-select`),
// délibérément conservé — un overlay portalé est un piège tactile sur mobile.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSearchHits } from '@/lib/hooks/use-search-hits';
import {
  normalizeArticleKey,
  rankArticles,
  type ExpenseArticleOption,
} from '@/lib/expense-article-search';

/** Classe du badge « Nouveau ». */
export const NEW_ARTICLE_BADGE_CLASS =
  'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';

export type ArticlePick =
  | { kind: 'existing'; article: ExpenseArticleOption }
  | { kind: 'new'; name: string };

const MAX_SUGGESTIONS = 8;
const priceFmt = new Intl.NumberFormat('fr-FR');

/** « 900 F/kg » — le prix moyen n'a de sens qu'accompagné de son unité. */
function formatUnitPrice(article: ExpenseArticleOption): string | null {
  if (article.lastUnitPrice == null) return null;
  const price = priceFmt.format(Math.round(article.lastUnitPrice));
  return article.baseUnit ? `${price} F/${article.baseUnit}` : `${price} F`;
}

export function ArticleCombobox({
  articles,
  onPick,
  usedArticleIds,
  placeholder = 'Rechercher ou créer un article…',
  autoFocus,
  clearOnPick = true,
  onCancel,
}: {
  articles: ExpenseArticleOption[];
  onPick: (pick: ArticlePick) => void;
  /** Articles déjà dans la dépense : coche discrète, jamais désactivés
   *  (acheter deux formats du même article est légitime). */
  usedArticleIds?: ReadonlySet<string>;
  placeholder?: string;
  autoFocus?: boolean;
  /** true pour le champ d'ajout (saisie en chaîne), false en remplacement. */
  clearOnPick?: boolean;
  /** Échap sans requête : referme le champ (mode remplacement). */
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // La recherche est faite par la base (pg_trgm) ; la saisie, elle, reste locale.
  const { hits } = useSearchHits('/api/expenses/articles/search', query);
  const suggestions = useMemo(
    () => rankArticles(hits, articles, query, { limit: MAX_SUGGESTIONS }),
    [hits, articles, query]
  );

  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 &&
    !articles.some(
      (a) => normalizeArticleKey(a.name) === normalizeArticleKey(trimmed)
    );

  const createIndex = suggestions.length;
  const optionCount = suggestions.length + (canCreate ? 1 : 0);
  // Borné au rendu : la liste rétrécit à la frappe, l'index mémorisé peut
  // pointer au-delà de la dernière option.
  const activeOption =
    optionCount === 0 ? -1 : Math.min(activeIndex, optionCount - 1);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function commit(pick: ArticlePick) {
    onPick(pick);
    if (clearOnPick) {
      setQuery('');
      setActiveIndex(0);
      // Le champ garde le focus : on enchaîne les ajouts sans repasser à la
      // souris.
      inputRef.current?.focus();
    } else {
      setOpen(false);
    }
  }

  function commitAt(position: number) {
    if (position < suggestions.length) {
      commit({ kind: 'existing', article: suggestions[position] });
    } else if (canCreate) {
      commit({ kind: 'new', name: trimmed });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (query.length > 0) {
        setQuery('');
      } else {
        setOpen(false);
        onCancel?.();
      }
      return;
    }
    if (!open || optionCount === 0) {
      if (event.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeOption + 1) % optionCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(activeOption <= 0 ? optionCount - 1 : activeOption - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commitAt(activeOption);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          aria-label="Article"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          className="pl-9"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && optionCount > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card py-1 text-sm shadow-md"
        >
          {suggestions.map((article, i) => {
            const price = formatUnitPrice(article);
            return (
              <li
                key={article.id}
                role="option"
                aria-selected={i === activeOption}
              >
                <button
                  type="button"
                  // onMouseDown : se déclenche avant le blur de l'input.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitAt(i);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left',
                    i === activeOption && 'bg-accent'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {usedArticleIds?.has(article.id) && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {article.trackInventory && <span aria-hidden>📦</span>}
                    <span className="truncate">{article.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {price}
                    {price && article.usageCount > 0 && ' · '}
                    {article.usageCount > 0 && `${article.usageCount} achats`}
                  </span>
                </button>
              </li>
            );
          })}

          {canCreate && (
            <li role="option" aria-selected={activeOption === createIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitAt(createIndex);
                }}
                onMouseEnter={() => setActiveIndex(createIndex)}
                className={cn(
                  'flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left',
                  activeOption === createIndex && 'bg-accent'
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Créer « {trimmed} »</span>
                </span>
                <Badge
                  variant="outline"
                  className={cn('shrink-0', NEW_ARTICLE_BADGE_CLASS)}
                >
                  Nouveau
                </Badge>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
