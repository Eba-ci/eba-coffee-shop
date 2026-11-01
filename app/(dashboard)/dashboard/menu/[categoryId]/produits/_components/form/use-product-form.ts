'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import { createProductAction, updateProductAction } from '../../../../actions';
import type { SupplementGroup } from '@/components/(dashboard)/supplements-editor';
import {
  pruneSupplementGroups,
  validateSupplementGroups,
} from '@/lib/supplements-form';
import {
  amountOrZero,
  costWarning,
  FIELD_TAB,
  firstFaultyField,
  isTabValue,
  listMissingRequired,
  validateProductDraft,
  VALIDATED_FIELDS,
  type FieldErrors,
  type ProductDraft,
  type TabValue,
} from '@/lib/menu/product-form-completeness';
import {
  EMPTY,
  initialAmount,
  initialSnapshot,
  type ProductFormInitial,
} from './types';
import { useFieldFocus } from './use-field-focus';

export function useProductForm({
  categoryId,
  initial,
  defaultTab,
  hasStats,
  hasStock,
}: {
  categoryId: string;
  initial?: ProductFormInitial;
  defaultTab?: string;
  hasStats: boolean;
  hasStock: boolean;
}) {
  const router = useRouter();
  const { pushToast } = useUndoToast();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [tab, setTab] = useState<TabValue>(() =>
    isTabValue(defaultTab) &&
    (defaultTab !== 'stats' || hasStats) &&
    (defaultTab !== 'stock' || hasStock)
      ? defaultTab
      : 'essentiel'
  );

  const [name, setName] = useState(initial?.name ?? EMPTY.name);
  const [description, setDescription] = useState(
    initial?.description ?? EMPTY.description
  );
  const [price, setPrice] = useState<string>(() =>
    initialAmount(initial?.price)
  );
  const [coutMatiere, setCoutMatiere] = useState<string>(() =>
    initialAmount(initial?.coutMatiere)
  );
  const [coutEmballage, setCoutEmballage] = useState<string>(() =>
    initialAmount(initial?.coutEmballage)
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.imageUrl ?? null
  );
  const [groups, setGroups] = useState<SupplementGroup[]>(
    initial?.supplementGroups ?? []
  );
  const [featured, setFeatured] = useState<boolean>(
    initial?.featured ?? EMPTY.featured
  );
  const [featuredOrder, setFeaturedOrder] = useState<number>(
    initial?.featuredOrder ?? EMPTY.featuredOrder
  );
  const [featuredBadge, setFeaturedBadge] = useState<string | null>(
    initial?.featuredBadge ?? EMPTY.featuredBadge
  );
  const [stockQuantity, setStockQuantity] = useState<number | null>(
    initial?.stockQuantity ?? EMPTY.stockQuantity
  );
  // Le stock affiché date du chargement : le renvoyer sans l'avoir touché effacerait les décréments survenus depuis.
  const [stockTouched, setStockTouched] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(
    initial?.scheduleId ?? EMPTY.scheduleId
  );
  const [advanceOrderDays, setAdvanceOrderDays] = useState<number | null>(
    initial?.advanceOrderDays ?? EMPTY.advanceOrderDays
  );
  const [requiresDeposit, setRequiresDeposit] = useState(
    initial?.requiresDeposit ?? EMPTY.requiresDeposit
  );
  const [preorderable, setPreorderable] = useState(
    initial?.preorderable ?? EMPTY.preorderable
  );

  const priceNum = amountOrZero(price);
  const coutMatiereNum = amountOrZero(coutMatiere);
  const coutEmballageNum = amountOrZero(coutEmballage);
  const isEdit = Boolean(initial?.id);

  const draft: ProductDraft = {
    name,
    description,
    price,
    coutMatiere,
    coutEmballage,
  };
  const missing = listMissingRequired(draft);
  const costHint = costWarning(draft);

  // Ne couvre que le payload : la pause et les semaines spéciales s'enregistrent d'elles-mêmes.
  const snapshot = JSON.stringify({
    name,
    description,
    price: priceNum,
    coutMatiere: coutMatiereNum,
    coutEmballage: coutEmballageNum,
    imageUrl,
    groups,
    featured,
    featuredOrder,
    featuredBadge,
    stockQuantity,
    scheduleId,
    advanceOrderDays,
    requiresDeposit,
    preorderable,
  });
  const initialSnapshotValue = useMemo(
    () => initialSnapshot(initial),
    [initial]
  );
  const isDirty = snapshot !== initialSnapshotValue;

  // Affichés seulement après une première tentative d'enregistrement.
  const supplementIssues = useMemo(
    () => validateSupplementGroups(groups),
    [groups]
  );
  const [showSupplementErrors, setShowSupplementErrors] = useState(false);

  useEffect(() => {
    if (!isDirty || isPending) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, isPending]);

  function changeTab(value: string) {
    const next = value as TabValue;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('onglet', next);
    window.history.replaceState(null, '', url);
  }

  const goToField = useFieldFocus(changeTab);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const found = validateProductDraft(draft);
    setErrors(found);
    const firstField = firstFaultyField(found);
    if (firstField) {
      goToField(firstField);
      pushToast('Corrigez les champs signalés avant d’enregistrer.', 'error');
      return;
    }

    // Suppléments validés à part : le repli serveur n'indique pas le groupe en cause.
    if (supplementIssues.size > 0) {
      setShowSupplementErrors(true);
      changeTab('supplements');
      pushToast(
        'Corrigez les suppléments signalés avant d’enregistrer.',
        'error'
      );
      return;
    }

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: priceNum,
        coutMatiere: coutMatiereNum,
        coutEmballage: coutEmballageNum,
        imageUrl,
        supplementGroups: pruneSupplementGroups(groups),
        featured,
        featuredOrder: featured ? Number(featuredOrder) || 0 : 0,
        featuredBadge: featured ? featuredBadge : null,
        // En édition, le stock n'est envoyé que s'il a été touché (cf. `stockTouched`).
        ...((!isEdit || stockTouched) && { stockQuantity }),
        scheduleId,
        advanceOrderDays,
        requiresDeposit,
        preorderable,
      };
      const result =
        isEdit && initial?.id
          ? await updateProductAction(initial.id, payload)
          : await createProductAction({ ...payload, categoryId });
      if (!result.ok) {
        setSubmitError(result.error);
        pushToast(result.error, 'error');
        return;
      }
      router.push(`/dashboard/menu/${categoryId}`);
      router.refresh();
      pushToast(isEdit ? `${payload.name} enregistré` : `${payload.name} créé`);
    });
  }

  function leave() {
    router.push(`/dashboard/menu/${categoryId}`);
  }

  function handleCancel() {
    if (isDirty) {
      setConfirmLeave(true);
      return;
    }
    leave();
  }

  const errorTabs = new Set(
    VALIDATED_FIELDS.filter((f) => errors[f]).map((f) => FIELD_TAB[f])
  );

  return {
    tab,
    changeTab,
    errorTabs,
    isEdit,
    errors,
    name,
    setName,
    description,
    setDescription,
    price,
    setPrice,
    priceNum,
    coutMatiere,
    setCoutMatiere,
    coutMatiereNum,
    coutEmballage,
    setCoutEmballage,
    coutEmballageNum,
    costHint,
    imageUrl,
    setImageUrl,
    isUploading,
    setIsUploading,
    groups,
    setGroups,
    supplementIssues,
    showSupplementErrors,
    featured,
    setFeatured,
    featuredOrder,
    setFeaturedOrder,
    featuredBadge,
    setFeaturedBadge,
    stockQuantity,
    setStockQuantity,
    setStockTouched,
    scheduleId,
    setScheduleId,
    advanceOrderDays,
    setAdvanceOrderDays,
    requiresDeposit,
    setRequiresDeposit,
    preorderable,
    setPreorderable,
    isPending,
    submitError,
    isDirty,
    missing,
    goToField,
    handleSubmit,
    handleCancel,
    confirmLeave,
    setConfirmLeave,
    leave,
  };
}

export type ProductFormState = ReturnType<typeof useProductForm>;
