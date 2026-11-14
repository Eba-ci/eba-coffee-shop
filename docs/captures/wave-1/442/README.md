# Captures — #442 (design moderne et hiérarchie)

Données **fictives** uniquement (Awa Traoré, Ibrahim Koné, Fatou Diomandé,
Yao Kouassi), rendues par Chrome headless depuis la page de fixtures jetable
(supprimée après capture), aux largeurs 1280 px (bureau) et 390 × 844 (mobile).

| Fichier | Avant / après |
| --- | --- |
| `avant-list-{desktop,mobile}.png` | Liste Employés avant refonte (cartes + tableau #441) |
| `apres-list-{desktop,mobile}.png` | Liste après : bande condensée Dû/Versé/Reste + états |
| `avant-detail-{desktop,mobile}.png` | Fiche avant : cartes empilées sans hiérarchie |
| `apres-detail-{desktop,mobile}.png` | Fiche après : bande de synthèse, sections ordonnées |
| `avant-paie-{desktop,mobile}.png` | Ancienne vue du mois (onglet Salaires de Dépenses) |
| `apres-paie-{desktop,mobile}.png` | Paie du mois : même en-tête, cartes de synthèse |

Vérifié à 390 × 844 : la bande de synthèse (nom, poste, statut, dû / versé /
reste / arriéré / avance) est entièrement visible sans défilement. Aucun
débordement horizontal : tableaux remplacés par des cartes sous `md`.