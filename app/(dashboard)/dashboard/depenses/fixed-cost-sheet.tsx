'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { FixedCostFields, emptyDraft, type Draft } from './fixed-cost-fields';
import {
  draftFromRow,
  draftToPayload,
  isDraftDirty,
  validateDraft,
  type FixedCostDraftSource,
} from './fixed-cost-draft';
import { createFixedCostAction, updateFixedCostAction } from './actions';

/** Cible du drawer : création neuve, ou ligne existante à modifier. */
export type FixedCostSheetTarget =
  | { mode: 'create' }
  | { mode: 'edit'; id: string; row: FixedCostDraftSource };

/**
 * Gabarit commun des tiroirs : pleine largeur et `dvh` sur mobile (le clavier
 * ne masque plus la barre d'action), largeur bornée dès `sm`, défilement
 * interne, zone sûre iOS.
 */
export const FIXED_COST_SHEET_CLASS =
  'h-dvh w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-xl';

function initialFor(
  target: FixedCostSheetTarget | null,
  categories: { id: string; name: string }[]
): Draft {
  if (target?.mode === 'edit') return draftFromRow(target.row);
  return emptyDraft(categories[0]?.id ?? '');
}

export function FixedCostSheet(props: {
  target: FixedCostSheetTarget | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  // Une instance neuve par cible : le brouillon est ainsi réinitialisé à
  // chaque ouverture (et prérempli en édition), sans effet de bord.
  const key = props.target
    ? props.target.mode === 'edit'
      ? `edit-${props.target.id}`
      : 'create'
    : 'closed';
  return <FixedCostSheetInner key={key} {...props} />;
}

function FixedCostSheetInner({
  target,
  categories,
  onClose,
}: {
  target: FixedCostSheetTarget | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  const initial = useMemo(
    () => initialFor(target, categories),
    [target, categories]
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const dirty = isDraftDirty(initial, draft);
  const isEdit = target?.mode === 'edit';
  const title = isEdit ? 'Modifier la charge' : 'Nouvelle charge';
  const description = isEdit
    ? 'Ajuste les informations et les échéances de cette charge fixe.'
    : 'Une charge fixe est répartie sur les jours ouverts de sa période.';

  function close() {
    setConfirmOpen(false);
    onClose();
  }

  function requestClose() {
    if (dirty) setConfirmOpen(true);
    else close();
  }

  function submit() {
    const invalid = validateDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = draftToPayload(draft);
      const result =
        target?.mode === 'edit'
          ? await updateFixedCostAction(target.id, payload)
          : await createFixedCostAction(payload);
      // Erreur serveur : on la garde dans le drawer, qui reste ouvert.
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
    });
  }

  return (
    <>
      <Sheet
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !pending) requestClose();
        }}
      >
        <SheetContent side="right" className={FIXED_COST_SHEET_CLASS}>
          {target && (
            <FixedCostSheetPanel
              title={title}
              description={description}
              submitLabel={isEdit ? 'Enregistrer' : 'Créer la charge'}
              categories={categories}
              draft={draft}
              set={set}
              error={error}
              pending={pending}
              onCancel={requestClose}
              onSubmit={submit}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les champs saisis ne seront pas enregistrés. Tu peux continuer la
              saisie pour les garder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-9">
              Continuer la saisie
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={close}
              className={buttonVariants({
                variant: 'destructive',
                className: 'h-11 sm:h-9',
              })}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Contenu du drawer, isolé pour le rendu de test (hors portail Radix). */
export function FixedCostSheetPanel({
  title,
  description,
  submitLabel,
  categories,
  draft,
  set,
  error,
  notice,
  pending,
  onCancel,
  onSubmit,
}: {
  /** Information non bloquante, affichée au-dessus des champs. */
  notice?: string | null;
  title: string;
  description: string;
  submitLabel: string;
  categories: { id: string; name: string }[];
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  error: string | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-12">
        <SheetTitle className="text-lg">{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {notice && (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {notice}
          </p>
        )}
        <FixedCostFields draft={draft} set={set} categories={categories} />
        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="shrink-0 border-t bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={onCancel}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="h-11 sm:h-9"
            onClick={onSubmit}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
