'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadToCloudinary } from '@/lib/cloudinary-client';
import { EXPENSE_ITEMS_MAX } from '@/config/constants';
import {
  applyDraftPatch,
  draftFromArticle,
  draftsToItemsInput,
  draftsTotal,
  emptyExpenseItemDraft,
  isQuantityPending,
  type ExpenseItemDraft,
} from '@/lib/expense-item-draft';
import type { ExpenseItemInput } from '@/lib/schemas/expense';
import type { ArticlePick } from '../article-combobox';
import { createExpenseAction, updateExpenseAction } from '../../actions';
import type { ExpenseFormValues } from './types';

export type ExpenseFormState = ReturnType<typeof useExpenseForm>;

export function useExpenseForm({
  mode,
  initial,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial: ExpenseFormValues;
  cancelHref: string;
  /** Intégré (drawer) : remplace la navigation après enregistrement. */
  onSuccess?: () => void;
  /** Intégré (drawer) : remplace le retour vers `cancelHref`. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ExpenseFormValues>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Un double envoi du même règlement de charge fixe ne crée qu'une dépense.
  const idempotencyKey = useRef<string | null>(null);
  // En édition, retirer toutes les lignes doit envoyer `items: null`.
  const initialHadItems = useRef(initial.items.length > 0);
  // Ligne fraîchement ajoutée : focus sur la quantité.
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null);

  const detailed = values.items.length > 0;
  const total = draftsTotal(values.items);
  const usedArticleIds = new Set(
    values.items
      .map((item) => item.articleId)
      .filter((id): id is string => id != null)
  );
  const atItemsLimit = values.items.length >= EXPENSE_ITEMS_MAX;

  function set<K extends keyof ExpenseFormValues>(
    key: K,
    value: ExpenseFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setItem(index: number, patch: Partial<ExpenseItemDraft>) {
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) =>
        i === index ? applyDraftPatch(item, patch) : item
      ),
    }));
  }

  function draftFromPick(pick: ArticlePick): ExpenseItemDraft {
    return pick.kind === 'existing'
      ? draftFromArticle(pick.article)
      : { ...emptyExpenseItemDraft(), rawLabel: pick.name };
  }

  function addFromPick(pick: ArticlePick) {
    if (atItemsLimit) {
      setError(`Trop de lignes : ${EXPENSE_ITEMS_MAX} au maximum.`);
      return;
    }
    setError(null);
    // Index calculé hors de l'updater : un `setState` niché s'y rejouerait en
    // StrictMode.
    setLastAddedIndex(values.items.length);
    setValues((v) => ({ ...v, items: [...v.items, draftFromPick(pick)] }));
  }

  /** Patch NON destructif : l'unité et le prix saisis à la main sont gardés. */
  function replaceArticle(index: number, pick: ArticlePick) {
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) => {
        if (i !== index) return item;
        const fresh = draftFromPick(pick);
        return applyDraftPatch(item, {
          articleId: fresh.articleId,
          rawLabel: fresh.rawLabel,
          unit: item.unit || fresh.unit,
          ...(item.unitPrice.trim().length === 0
            ? {
                unitPrice: fresh.unitPrice,
                unitPriceIsSuggestion: fresh.unitPriceIsSuggestion,
              }
            : {}),
        });
      }),
    }));
  }

  function removeItem(index: number) {
    setLastAddedIndex(null);
    setValues((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }));
  }

  function clearItems() {
    setLastAddedIndex(null);
    set('items', []);
  }

  async function onPickFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, '/api/upload/receipt/sign');
      set('receiptUrl', url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’upload');
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    if (!values.categoryId) {
      setError('Choisis une catégorie');
      return;
    }

    let amountInt: number;
    // `undefined` = ne pas toucher au détail · `null` = le retirer ·
    // tableau = remplacement complet.
    let items: ExpenseItemInput[] | null | undefined;

    if (detailed) {
      // Création seulement : en édition, une ligne historique sans quantité
      // basculerait au simple ré-enregistrement.
      const drafts =
        mode === 'create'
          ? values.items.map((item) => ({
              ...item,
              pendingQuantity: item.pendingQuantity || isQuantityPending(item),
            }))
          : values.items;

      const validation = draftsToItemsInput(drafts);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      items = validation.items;
      amountInt = validation.total;
    } else {
      amountInt = Math.round(Number(values.amount));
      if (!Number.isFinite(amountInt) || amountInt <= 0) {
        setError('Montant invalide');
        return;
      }
      items = mode === 'edit' && initialHadItems.current ? null : undefined;
    }

    const payload = {
      date: values.date,
      amount: amountInt,
      categoryId: values.categoryId,
      paymentMethod: values.paymentMethod,
      supplier: values.supplier.trim() || null,
      note: values.note.trim() || null,
      receiptUrl: values.receiptUrl,
      ...(items !== undefined ? { items } : {}),
      // Règlement d'une occurrence de charge fixe : lien posé à la création.
      ...(mode === 'create' && values.fixedCostId
        ? { fixedCostId: values.fixedCostId, dueDate: values.dueDate ?? null }
        : {}),
    };

    startTransition(async () => {
      const result =
        mode === 'edit' && values.id
          ? await updateExpenseAction(values.id, payload)
          : await createExpenseAction(
              payload,
              values.fixedCostId
                ? (idempotencyKey.current ??= crypto.randomUUID())
                : undefined
            );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onSuccess) onSuccess();
      else router.push(cancelHref);
      router.refresh();
    });
  }

  return {
    mode,
    cancelHref,
    router,
    onCancel,
    values,
    set,
    uploading,
    error,
    pending,
    busy: pending || uploading,
    fileRef,
    lastAddedIndex,
    detailed,
    total,
    usedArticleIds,
    atItemsLimit,
    setItem,
    addFromPick,
    replaceArticle,
    removeItem,
    clearItems,
    onPickFile,
    submit,
  };
}
