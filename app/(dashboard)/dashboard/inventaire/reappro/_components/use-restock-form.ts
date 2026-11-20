'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type InventoryItemView } from '@/lib/inventory';
import { todayDateString } from '@/lib/timezone';
import {
  suggestRestockQuantity,
  type InventoryItemOption,
} from '@/lib/inventory-item-search';
import { batchRestockAction } from '../../actions';
import type { LastCost, Line, PaymentMethod } from './restock-shared';

export function useRestockForm({
  items,
  lastCosts,
  prefillLowStock,
}: {
  items: InventoryItemView[];
  lastCosts: Record<string, LastCost>;
  prefillLowStock: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(todayDateString());
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [createExpense, setCreateExpense] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemMap = useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items]
  );
  const lowStockItems = useMemo(
    () => items.filter((it) => it.isLowStock),
    [items]
  );

  function newLine(item: InventoryItemView): Line {
    const last = lastCosts[item.id];
    const suggested = suggestRestockQuantity(item);
    return {
      itemId: item.id,
      quantity: suggested === null ? '' : String(suggested),
      unitCost: last ? String(last.unitCost) : '',
      costIsSuggestion: Boolean(last),
    };
  }

  const [lines, setLines] = useState<Line[]>(() =>
    prefillLowStock ? items.filter((it) => it.isLowStock).map(newLine) : []
  );

  const quantityRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [lastAdded, setLastAdded] = useState<number | null>(
    prefillLowStock && lowStockItems.length > 0 ? 0 : null
  );

  const options: InventoryItemOption[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        sku: it.sku,
        name: it.name,
        category: it.category,
        unit: it.unit,
        currentQuantity: it.currentQuantity,
        safetyStock: it.safetyStock,
        reorderPoint: it.reorderPoint,
        isLowStock: it.isLowStock,
      })),
    [items]
  );
  const usedItemIds = useMemo(
    () => new Set(lines.map((l) => l.itemId)),
    [lines]
  );

  const subtotal = (l: Line) => Number(l.quantity) * Number(l.unitCost || 0);
  const grandTotal = lines.reduce((sum, l) => {
    const s = subtotal(l);
    return sum + (Number.isFinite(s) ? s : 0);
  }, 0);

  const unknownCostCount = lines.filter(
    (l) => Number(l.unitCost || 0) <= 0
  ).length;

  function addItem(option: InventoryItemOption) {
    const item = itemMap.get(option.id);
    if (!item) return;
    setError(null);
    setLines((prev) => {
      if (prev.some((l) => l.itemId === item.id)) return prev;
      setLastAdded(prev.length);
      return [...prev, newLine(item)];
    });
  }

  function addAllLowStock() {
    setError(null);
    setLines((prev) => {
      const seen = new Set(prev.map((l) => l.itemId));
      const added = lowStockItems.filter((it) => !seen.has(it.id)).map(newLine);
      if (added.length > 0) setLastAdded(prev.length);
      return [...prev, ...added];
    });
  }

  function updateLine(itemId: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l))
    );
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  function setQuantityRef(index: number, el: HTMLInputElement | null) {
    quantityRefs.current[index] = el;
  }

  function focusNextQuantity(index: number) {
    for (let i = index + 1; i < quantityRefs.current.length; i++) {
      const el = quantityRefs.current[i];
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  }

  const invalidLine = (l: Line) => {
    const q = Number(l.quantity);
    return l.quantity.trim() === '' || !Number.isFinite(q) || q <= 0;
  };
  const hasInvalidLine = lines.some(invalidLine);
  const missingCategory = createExpense && !expenseCategoryId;
  // Le serveur refuse une dépense liée à un total nul : on le dit avant l'aller-retour.
  const expenseBlocked = grandTotal <= 0;
  const canSubmit =
    lines.length > 0 && !hasInvalidLine && !missingCategory && !pending;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await batchRestockAction({
        date,
        supplier: supplier.trim() || undefined,
        note: note.trim() || undefined,
        createExpense: createExpense && !expenseBlocked,
        expenseCategoryId:
          createExpense && !expenseBlocked ? expenseCategoryId : undefined,
        paymentMethod,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost || 0),
        })),
      });
      if (res.ok) {
        router.push('/dashboard/inventaire');
      } else {
        setError(res.error);
      }
    });
  }

  return {
    date,
    setDate,
    supplier,
    setSupplier,
    paymentMethod,
    setPaymentMethod,
    note,
    setNote,
    createExpense,
    setCreateExpense,
    expenseCategoryId,
    setExpenseCategoryId,
    detailsOpen,
    setDetailsOpen,
    error,
    pending,
    itemMap,
    lowStockItems,
    lines,
    options,
    usedItemIds,
    lastAdded,
    setQuantityRef,
    grandTotal,
    unknownCostCount,
    subtotal,
    addItem,
    addAllLowStock,
    updateLine,
    removeLine,
    focusNextQuantity,
    missingCategory,
    expenseBlocked,
    canSubmit,
    handleSubmit,
    lastCosts,
  };
}

export type RestockForm = ReturnType<typeof useRestockForm>;
