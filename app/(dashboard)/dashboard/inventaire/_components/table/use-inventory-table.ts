'use client';

import { useMemo, useState, useTransition } from 'react';
import type { InventoryItemView } from '@/lib/inventory';
import { useSearchHits } from '@/lib/hooks/use-search-hits';
import { itemsByHits } from '@/lib/search/rank';
import { useConfirmDialog } from '../../../_components/use-confirm-dialog';
import {
  archiveInventoryItemAction,
  createInventoryItemAction,
  restoreInventoryItemAction,
  updateInventoryItemAction,
} from '../../actions';
import { emptyItem, itemFromView, type ItemFormValues } from '../../item-form';
import { toCreateInput, toUpdateInput } from './helpers';

export type InventoryTableState = ReturnType<typeof useInventoryTable>;

export function useInventoryTable({
  items,
  archived,
}: {
  items: InventoryItemView[];
  archived: InventoryItemView[];
}) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  // Une erreur par surface : un état partagé affichait l'échec d'un archivage
  // dans la barre d'outils ET dans les sheets ouverts.
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const visibleItems = showArchived ? archived : items;

  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<ItemFormValues>(emptyItem);

  const [editItem, setEditItem] = useState<InventoryItemView | null>(null);
  const [editValues, setEditValues] = useState<ItemFormValues>(emptyItem);

  // Recherche faite par la base (pg_trgm) ; la saisie reste locale.
  const { hits } = useSearchHits('/api/inventory/search', search);

  const filtered = useMemo(() => {
    const base = hits ? itemsByHits(visibleItems, hits) : visibleItems;
    return base.filter(
      (it) => categoryFilter === 'all' || (it.category ?? '') === categoryFilter
    );
  }, [visibleItems, hits, categoryFilter]);

  function openCreate() {
    setFormError(null);
    setCreateValues(emptyItem);
    setCreateOpen(true);
  }

  function openEdit(item: InventoryItemView) {
    setFormError(null);
    setEditItem(item);
    setEditValues(itemFromView(item));
  }

  function submitCreate() {
    setFormError(null);
    const v = createValues;
    if (!v.name.trim()) {
      setFormError('Le nom est obligatoire.');
      return;
    }
    const input = toCreateInput(v);
    startTransition(async () => {
      const r = await createInventoryItemAction(input);
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      setCreateOpen(false);
    });
  }

  function submitEdit() {
    if (!editItem) return;
    setFormError(null);
    const v = editValues;
    if (!v.name.trim()) {
      setFormError('Le nom est obligatoire.');
      return;
    }
    const input = toUpdateInput(v);
    const id = editItem.id;
    startTransition(async () => {
      const r = await updateInventoryItemAction(id, input);
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      setEditItem(null);
    });
  }

  async function archive(item: InventoryItemView) {
    const confirmed = await confirm({
      title: 'Archiver la référence',
      message: `« ${item.name} » n’apparaîtra plus dans la liste ni dans les comptages. Son historique est conservé et elle peut être restaurée.`,
      confirmLabel: 'Archiver',
      destructive: true,
    });
    if (!confirmed) return;
    setListError(null);
    setPendingId(item.id);
    startTransition(async () => {
      const r = await archiveInventoryItemAction(item.id);
      setPendingId(null);
      if (!r.ok) {
        setListError(r.error);
        return;
      }
    });
  }

  function restore(item: InventoryItemView) {
    setListError(null);
    setPendingId(item.id);
    startTransition(async () => {
      const r = await restoreInventoryItemAction(item.id);
      setPendingId(null);
      if (!r.ok) {
        setListError(r.error);
        return;
      }
    });
  }

  return {
    pending,
    pendingId,
    confirmDialog,
    listError,
    formError,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    showArchived,
    setShowArchived,
    filtered,
    createOpen,
    setCreateOpen,
    createValues,
    setCreateValues,
    editItem,
    setEditItem,
    editValues,
    setEditValues,
    openCreate,
    openEdit,
    submitCreate,
    submitEdit,
    archive,
    restore,
  };
}
