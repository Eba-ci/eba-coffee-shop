/** Nombre de tentatives lors d'une collision sur l'index unique (dailyDate, dailyNumber) au moment de créer une commande. */
export const DAILY_NUMBER_MAX_RETRIES = 3;

/** Taille de page par défaut pour la liste paginée des commandes (dashboard / admin). */
export const ORDERS_PAGE_SIZE = 20;

/** Recherche de commande par téléphone : nombre minimum de chiffres saisis avant d'activer la comparaison « sous-chaîne de chiffres bruts ». */
export const PHONE_SEARCH_MIN_DIGITS = 3;

/** Longueurs max des champs de saisie commande. */
export const ORDER_CUSTOMER_NAME_MAX = 50;

export const ORDER_CUSTOMER_PHONE_MAX = 30;

export const ORDER_NOTE_MAX = 500;

/** Commande en ligne (checkout public) : nombre de mots max du nom client. */
export const ORDER_CUSTOMER_NAME_MAX_WORDS = 5;

export const CUSTOMER_TRUSTED_NOTE_MAX = 300;

/** Page publique de suivi de commande (/commande/:id) : intervalle de rafraîchissement du statut (polling léger, le SSE reste réservé au staff). */
export const ORDER_TRACKING_POLL_INTERVAL_MS = 15_000;

export const ORDER_TRACKING_POLL_FAST_INTERVAL_MS = 5_000;

export const CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Durée de vie d'une commande « mise de côté » à la caisse (localStorage) : une journée de service. */
export const PARKED_ORDER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Nombre maximal de commandes mises de côté simultanément sur un appareil. */
export const PARKED_ORDERS_MAX = 10;

/** Historique local « mes commandes » (lib/order-history.ts) : nombre max de commandes conservées par appareil (localStorage, sans compte). */
export const ORDER_HISTORY_MAX = 10;

/** Plafond du sélecteur de quantité de la modale produit (site public). */
export const CART_ITEM_QUANTITY_MAX = 20;

/** Remise caisse : une remise (montant fixe en FCFA) appliquée à une ligne d'article ne peut pas dépasser cette fraction du prix brut de la ligne. */
export const MAX_LINE_DISCOUNT_RATIO = 0.5;

/** Commande sur mesure : % minimum du total exigé en acompte avant prise en compte. */
export const MIN_DEPOSIT_PERCENT = 50;

/** Paiement en ligne (Jèko) : durée pendant laquelle une commande attend son paiement, comptée à partir de CHAQUE tentative. */
export const PAYMENT_EXPIRY_MINUTES = 3;

/**
 * Plafond MENSUEL d'un compte Jèko (FCFA), règle de Jèko : on le SIGNALE, on ne
 * l'applique pas. Comparé à ce que le compte a encaissé dans le mois civil en cours
 * (un retrait ne libère rien : c'est un flux mensuel, pas un plafond de solde).
 */
export const JEKO_MONTHLY_LIMIT_FCFA = 2_000_000;
/** Part du plafond à partir de laquelle on prévient (0-1). */
export const JEKO_MONTHLY_WARN_RATIO = 0.9;

/** Frais de paiement en ligne facturés au client, en % du total (Jèko Checkout prélève 1,5 % : EBA absorbe l'écart). */
export const ONLINE_FEE_PERCENT_DEFAULT = 1;

/** Longueur max du motif de remise saisi par le caissier. */
export const ORDER_DISCOUNT_REASON_MAX = 100;

/** Vue « Réguliers » des clients : nombre minimum de JOURS différents avec commande sur la période. */
export const REGULAR_CUSTOMER_MIN_DAYS = 3;
