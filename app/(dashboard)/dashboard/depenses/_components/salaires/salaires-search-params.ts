// Paramètres d'URL de l'onglet « Salaires » (nuqs). Même navigation par mois
// que le Point mort : la clé `mois` (YYYY-MM) est partagée par les deux
// onglets, donc changer de mois puis d'onglet garde le même mois affiché.
//
// Import depuis `nuqs/server` : aucun code React, utilisable côté serveur.

import { createLoader, parseAsString } from 'nuqs/server';

export const salairesParsers = {
  mois: parseAsString,
};

export const loadSalairesParams = createLoader(salairesParsers);
