import type { Draft } from './fixed-cost-fields';

/** Valeurs d'une charge existante, telles que listées dans le point mort. */
export type FixedCostDraftSource = {
  label: string;
  amount: number;
  periodicity: Draft['periodicity'];
  startDate: string;
  endDate: string | null;
  categoryId: string;
  note?: string | null;
  /** Vide = échéance par défaut déduite de la prise d'effet. */
  installments: { monthOffset: number; day: number; amount: number }[];
};

/** Brouillon d'édition : tout est prérempli, échéances comprises. */
export function draftFromRow(row: FixedCostDraftSource): Draft {
  return {
    label: row.label,
    amount: String(row.amount),
    periodicity: row.periodicity,
    startDate: row.startDate,
    endDate: row.endDate ?? '',
    categoryId: row.categoryId,
    note: row.note ?? '',
    installments: row.installments.map((i) => ({
      monthOffset: String(i.monthOffset),
      day: String(i.day),
      amount: String(i.amount),
    })),
  };
}

/**
 * Payload envoyé aux actions existantes : mêmes clés et mêmes types que le
 * formulaire inline précédent, plus la note (déjà acceptée par le schéma).
 */
export function draftToPayload(draft: Draft) {
  return {
    label: draft.label,
    amount: Math.round(Number(draft.amount)),
    periodicity: draft.periodicity,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    categoryId: draft.categoryId,
    note: draft.note.trim() || null,
    installments: draft.installments.map((i) => ({
      monthOffset: Number(i.monthOffset) || 0,
      day: Math.round(Number(i.day)),
      amount: Math.round(Number(i.amount)),
    })),
  };
}

/** Validation locale minimale ; le serveur reste juge du contrat complet. */
export function validateDraft(draft: Draft): string | null {
  const amount = Math.round(Number(draft.amount));
  if (!draft.label.trim() || !(amount > 0)) return 'Libellé et montant requis';
  if (!draft.categoryId) return 'Choisis une catégorie';
  return null;
}

function sameInstallments(a: Draft['installments'], b: Draft['installments']) {
  if (a.length !== b.length) return false;
  return a.every(
    (it, i) =>
      it.monthOffset === b[i].monthOffset &&
      it.day === b[i].day &&
      it.amount === b[i].amount
  );
}

/**
 * Un brouillon est « modifié » dès qu'un champ diffère de la valeur d'ouverture
 * (y compris une échéance ajoutée, retirée ou retouchée).
 */
export function isDraftDirty(initial: Draft, current: Draft): boolean {
  return (
    initial.label !== current.label ||
    initial.amount !== current.amount ||
    initial.periodicity !== current.periodicity ||
    initial.startDate !== current.startDate ||
    initial.endDate !== current.endDate ||
    initial.categoryId !== current.categoryId ||
    initial.note !== current.note ||
    !sameInstallments(initial.installments, current.installments)
  );
}
