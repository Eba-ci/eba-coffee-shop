'use client';

// Action « Créer la charge depuis l'historique » (#452). Le formulaire reçoit
// la proposition de la détection ; il ne la recalcule pas. L'enregistrement ne
// crée aucune dépense : il pose seulement une prise d'effet passée.

import { useState, useTransition } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  FixedCostSheetPanel,
  FIXED_COST_SHEET_CLASS,
} from '../../fixed-cost-sheet';
import type { Draft } from '../../fixed-cost-fields';
import { draftToPayload, validateDraft } from '../../fixed-cost-draft';
import { backfillFixedCostAction } from '../../actions';
import {
  startAfterFirstMonthNotice,
  type BackfillSuggestion,
} from '@/lib/fixed-costs/backfill-suggestion';

const draftOf = (s: BackfillSuggestion): Draft => ({
  label: s.label,
  amount: s.amount > 0 ? String(s.amount) : '',
  periodicity: s.periodicity,
  startDate: s.startDate,
  endDate: '',
  categoryId: s.categoryId,
  note: '',
  installments: [],
});

export function BackfillAction({
  suggestion,
  categories,
}: {
  suggestion: BackfillSuggestion;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 sm:h-9"
        onClick={() => setOpen(true)}
      >
        <History className="h-4 w-4" aria-hidden />
        {suggestion.alreadyConverted
          ? 'Corriger la prise d’effet'
          : 'Créer la charge depuis l’historique'}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={FIXED_COST_SHEET_CLASS}>
          {/* Montée à l'ouverture : brouillon neuf à chaque fois. */}
          {open && (
            <BackfillPanel
              suggestion={suggestion}
              categories={categories}
              onClose={() => setOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function BackfillPanel({
  suggestion,
  categories,
  onClose,
}: {
  suggestion: BackfillSuggestion;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(suggestion));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const notices = [
    suggestion.alreadyConverted
      ? 'Cette catégorie a déjà sa charge : seule la prise d’effet sera corrigée, les autres champs sont ignorés.'
      : null,
    startAfterFirstMonthNotice(draft.startDate, suggestion.firstMonth),
  ].filter(Boolean);

  function submit() {
    const invalid = suggestion.alreadyConverted ? null : validateDraft(draft);
    if (invalid) return setError(invalid);
    setError(null);
    const { label, amount, periodicity, startDate, categoryId, installments } =
      draftToPayload(draft);
    startTransition(async () => {
      const res = await backfillFixedCostAction({
        categoryId: suggestion.alreadyConverted
          ? suggestion.categoryId
          : categoryId,
        startDate,
        label,
        amount,
        periodicity,
        installments,
      });
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  return (
    <FixedCostSheetPanel
      title={
        suggestion.alreadyConverted
          ? 'Corriger la prise d’effet'
          : 'Créer la charge depuis l’historique'
      }
      description="Aucune dépense n’est créée : les mois sans dépense liée apparaîtront en retard dans Paiements."
      submitLabel={suggestion.alreadyConverted ? 'Corriger' : 'Créer la charge'}
      categories={categories}
      draft={draft}
      set={set}
      error={error}
      notice={notices.length > 0 ? notices.join(' ') : null}
      pending={pending}
      onCancel={onClose}
      onSubmit={submit}
    />
  );
}
