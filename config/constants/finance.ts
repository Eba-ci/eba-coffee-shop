/** Suivi des dépenses (back-office). */
export const EXPENSE_CATEGORY_NAME_MAX = 50;

export const EXPENSE_SUPPLIER_MAX = 100;

export const EXPENSE_NOTE_MAX = 500;

export const EXPENSE_AMOUNT_MAX = 100_000_000;

/** Longueur max du libellé d'un modèle de dépense récurrente. */
export const EXPENSE_RECURRING_LABEL_MAX = 50;

/** Détail par article des dépenses (référentiel + lignes). */
export const EXPENSE_ARTICLE_NAME_MAX = 60;

export const EXPENSE_ITEM_LABEL_MAX = 100;

export const EXPENSE_ITEM_UNIT_MAX = 20;

/** Nombre max de lignes de détail par dépense. */
export const EXPENSE_ITEMS_MAX = 50;

export const EXPENSE_ITEM_QUANTITY_MAX = 1_000_000;

/** Investissements (apports / financements). */
export const INVESTMENT_SOURCE_NAME_MAX = 50;

export const INVESTMENT_FINANCIER_MAX = 100;

export const INVESTMENT_NOTE_MAX = 500;

export const INVESTMENT_AMOUNT_MAX = 1_000_000_000;

/** Régularisation de recette (ajustement manuel du CA). */
export const REVENUE_ADJUSTMENT_NOTE_MAX = 500;

export const REVENUE_ADJUSTMENT_AMOUNT_MAX = 100_000_000;

/** Salaires (admin seul). */
export const SALARY_NAME_MAX = 100;

export const SALARY_POSITION_MAX = 100;

export const SALARY_NOTE_MAX = 500;

/** Longueur minimale d'un identifiant de référence (employé…). */
export const SALARY_ID_MIN_LENGTH = 1;

/** Étendue d'étalement de la récupération d'une avance (en mois). */
export const SALARY_RECOVERY_MONTHS_MIN = 1;

export const SALARY_RECOVERY_MONTHS_MAX = 60;

/** Longueur de la clé d'idempotence d'un versement. */
export const SALARY_IDEMPOTENCY_KEY_MIN = 1;

export const SALARY_IDEMPOTENCY_KEY_MAX = 200;

/** Message unique de cohérence des bornes d'emploi (entrée / sortie). */
export const SALARY_END_AFTER_START_MESSAGE =
  'La sortie doit être après l’entrée';
