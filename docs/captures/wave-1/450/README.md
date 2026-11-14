# Captures — #450 (consolidation, retrait de l'onglet Salaires)

Données **fictives**. L'« avant » montre la vue du mois telle qu'elle vivait
dans l'onglet **Salaires de Dépenses** ; l'« après » montre le module Employés
(`/dashboard/employes/paie`) et la liste qui y mène.

| Fichier | Contenu |
| --- | --- |
| `avant-paie-{desktop,mobile}.png` | Ancienne vue du mois (onglet Salaires) |
| `apres-paie-{desktop,mobile}.png` | Paie du mois consolidée, ADMIN + COMPTABLE |
| `avant-list-{desktop,mobile}.png` | Liste avant l'accès Paie |
| `apres-list-{desktop,mobile}.png` | Liste avec l'entrée « Paie du mois » |

L'onglet Salaires n'existe plus dans Dépenses ; `/dashboard/depenses?tab=salaires`
(et `&mois=YYYY-MM`) redirige vers `/dashboard/employes/paie` — vérifié par
`depenses/page.test.tsx`, aucun 404.