// Paramètres d'URL de la Paie du mois (nuqs). Une seule définition, partagée
// par le serveur (`createLoader`) et le client (`useQueryStates`) : une valeur
// invalide retombe sur null des deux côtés (`parseMonth` applique le défaut).
//
//   mois   YYYY-MM affiché (relit la base : `shallow: false`)

import { createLoader, parseAsString } from 'nuqs/server';

export const paieParsers = {
  mois: parseAsString,
};

export const loadPaieParams = createLoader(paieParsers);