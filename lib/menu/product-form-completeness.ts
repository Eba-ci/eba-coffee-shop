// lib/menu/product-form-completeness.ts
//
// Logique pure de la fiche produit (`app/(dashboard)/dashboard/menu/
// [categoryId]/produits/product-form.tsx`), extraite du composant pour la même
// raison que `lib/supplements-form.ts` : les tests tournent en environnement
// `node`, sans Testing Library — seule de la logique sans JSX est testable.
//
// Ce module répond à trois questions, et à elles seules :
//   « qu'est-ce qui bloque ? »   → `validateProductDraft`
//   « qu'est-ce qui manque ? »   → `listMissingRequired`
//   « qu'est-ce qui est louche ? » → `costWarning`
//
// La distinction porte tout l'écran : une erreur interdit d'enregistrer et ne
// s'affiche qu'après une tentative ; un manque s'annonce en permanence et sans
// reproche ; un avertissement n'interdit rien. Les confondre, c'est soit
// bloquer quelqu'un sur un champ facultatif, soit le laisser créer un produit
// à 0 FCFA sans rien dire — les deux se sont produits.
//
// Les messages reprennent les contraintes de `productInputSchema`
// (`lib/menu-mutations.ts`) : la validation cliente n'est qu'une avance sur le
// repli serveur, les deux doivent dire la même chose.

/** Onglets de la fiche produit. */
export const TAB_VALUES = [
  'essentiel',
  'couts',
  'disponibilite',
  'supplements',
  'mise-en-avant',
  'stats',
  'stock',
] as const;
export type TabValue = (typeof TAB_VALUES)[number];

export function isTabValue(v: string | undefined): v is TabValue {
  return TAB_VALUES.includes(v as TabValue);
}

/** Champs validés côté client. */
export const VALIDATED_FIELDS = [
  'name',
  'description',
  'price',
  'coutMatiere',
  'coutEmballage',
] as const;
export type ValidatedField = (typeof VALIDATED_FIELDS)[number];
export type FieldErrors = Partial<Record<ValidatedField, string>>;

/**
 * Les seuls champs sans lesquels le serveur refuse le produit
 * (`productInputSchema` : `name` 1-120, `description` min 1, `price` entier
 * positif). Tout le reste a un défaut serveur et peut attendre.
 */
export const REQUIRED_FIELDS = ['name', 'description', 'price'] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** Onglet à ouvrir pour atteindre un champ. */
export const FIELD_TAB: Record<ValidatedField, TabValue> = {
  name: 'essentiel',
  description: 'essentiel',
  price: 'essentiel',
  coutMatiere: 'couts',
  coutEmballage: 'couts',
};

/** `id` du contrôle dans le DOM — sert à y placer le curseur. */
export const FIELD_IDS: Record<ValidatedField, string> = {
  name: 'name',
  description: 'desc',
  price: 'price',
  coutMatiere: 'cout-matiere',
  coutEmballage: 'cout-emballage',
};

/** Libellés tels qu'affichés à l'écran, pour que le rappel les nomme pareil. */
export const FIELD_LABELS: Record<ValidatedField, string> = {
  name: 'Nom',
  description: 'Description',
  price: 'Prix de vente',
  coutMatiere: 'Coût matière',
  coutEmballage: 'Coût emballage',
};

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;

/**
 * Brouillon tel qu'il vit dans le formulaire : les montants y sont des
 * CHAÎNES, parce qu'un `<input type="number">` vidé rend `''` et non `0`.
 * Cette distinction est tout l'enjeu — voir `parseAmount`.
 */
export type ProductDraft = {
  name: string;
  description: string;
  price: string;
  coutMatiere: string;
  coutEmballage: string;
};

/**
 * Entier positif saisi dans un `<input type="number">`, ou `null`.
 *
 * `null` recouvre deux cas que l'appelant doit distinguer lui-même : le champ
 * vide (rien n'a été saisi) et la saisie invalide (« 12.5 », « -3 »). D'où
 * `isBlank` à côté.
 */
export function parseAmount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function isBlank(raw: string): boolean {
  return raw.trim() === '';
}

/** Valeur à envoyer au serveur pour un montant facultatif laissé vide. */
export function amountOrZero(raw: string): number {
  return parseAmount(raw) ?? 0;
}

/**
 * Erreurs bloquantes. Les coûts sont FACULTATIFS : un champ vide vaut 0 et ne
 * produit aucune erreur — seule une saisie qui n'est pas un entier positif en
 * est une. C'est la contrepartie de `costWarning`, qui signale sans bloquer.
 */
export function validateProductDraft(draft: ProductDraft): FieldErrors {
  const errors: FieldErrors = {};

  const name = draft.name.trim();
  if (name.length === 0) errors.name = 'Le nom est obligatoire.';
  else if (name.length > NAME_MAX)
    errors.name = `Nom trop long (max ${NAME_MAX} caractères).`;

  const description = draft.description.trim();
  if (description.length === 0)
    errors.description = 'La description est obligatoire.';
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Description trop longue (max ${DESCRIPTION_MAX} caractères).`;

  if (isBlank(draft.price))
    errors.price = 'Indiquez un prix de vente, en francs CFA.';
  else if (parseAmount(draft.price) === null)
    errors.price = 'Prix invalide : un nombre entier, 0 minimum.';

  if (!isBlank(draft.coutMatiere) && parseAmount(draft.coutMatiere) === null)
    errors.coutMatiere = 'Coût invalide : un nombre entier, 0 minimum.';
  if (
    !isBlank(draft.coutEmballage) &&
    parseAmount(draft.coutEmballage) === null
  )
    errors.coutEmballage = 'Coût invalide : un nombre entier, 0 minimum.';

  return errors;
}

export type MissingField = {
  field: RequiredField;
  label: string;
  tab: TabValue;
};

/**
 * Ce qu'il reste à remplir pour pouvoir enregistrer. Affiché en permanence, y
 * compris avant toute tentative : c'est une annonce, pas un reproche — d'où le
 * fait qu'elle ne regarde QUE le vide, jamais la validité (un nom trop long est
 * une erreur, pas un manque).
 */
export function listMissingRequired(draft: ProductDraft): MissingField[] {
  return REQUIRED_FIELDS.filter((field) => isBlank(draft[field])).map(
    (field) => ({
      field,
      label: FIELD_LABELS[field],
      tab: FIELD_TAB[field],
    })
  );
}

/**
 * Un prix renseigné et aucun coût en face : la marge affichée vaut alors le
 * prix de vente entier, et toutes les statistiques qui en découlent sont
 * fausses. On le dit — sans bloquer : certains produits n'ont réellement aucun
 * coût saisi, et forcer une valeur inventée serait pire que l'absence.
 *
 * `null` = rien à signaler.
 */
export function costWarning(draft: ProductDraft): string | null {
  const price = parseAmount(draft.price);
  if (price === null || price === 0) return null;
  if (amountOrZero(draft.coutMatiere) > 0) return null;
  if (amountOrZero(draft.coutEmballage) > 0) return null;
  return 'Aucun coût renseigné : la marge affichée vaut le prix de vente entier, et le suivi de rentabilité sera faux. Vous pouvez enregistrer quand même.';
}

/** Premier champ fautif, dans l'ordre d'affichage — celui à atteindre. */
export function firstFaultyField(errors: FieldErrors): ValidatedField | null {
  return VALIDATED_FIELDS.find((field) => errors[field]) ?? null;
}
