// Paramètres d'URL de l'onglet « Salaires » (nuqs). Même navigation par mois
// que le Point mort : la clé `mois` (YYYY-MM) est partagée par les deux
// onglets, donc changer de mois puis d'onglet garde le même mois affiché.
//
// Le serveur relit le mois via le loader du Point mort (`point-mort-search-params`,
// même clé `mois`) ; ce fichier ne sert qu'à l'état client (`SalairesMonthNav`).

import { parseAsString } from 'nuqs/server';

export const salairesParsers = {
  mois: parseAsString,
};
