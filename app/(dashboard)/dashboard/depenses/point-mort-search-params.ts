// Paramètres d'URL de l'onglet « Point mort » (nuqs). Définition UNIQUE,
// partagée par le serveur (`createLoader`, page Dépenses) et le client
// (`useQueryStates`) : une valeur invalide retombe sur null des deux côtés.
//
//   mois    YYYY-MM affiché (relit la base : navigation `shallow: false`)
//   vue     calendrier | liste (affichage seul, pas de relecture serveur)
//   manques 1 = ne montrer que les jours sous le seuil (affichage seul)
//
// Import depuis `nuqs/server` : aucun code React, utilisable côté serveur.

import {
  createLoader,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

export const POINT_MORT_VIEWS = ['calendrier', 'liste'] as const;
export type PointMortView = (typeof POINT_MORT_VIEWS)[number];

export const pointMortParsers = {
  mois: parseAsString,
  vue: parseAsStringLiteral(POINT_MORT_VIEWS),
  manques: parseAsBoolean,
};

export const loadPointMortParams = createLoader(pointMortParsers);
