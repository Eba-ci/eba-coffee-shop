# Captures — #466 (actions sur la liste Employés)

Données **fictives**. L'« avant » correspond à la liste livrée par #442 (lien
seul, aucun menu) ; l'« après » ajoute l'en-tête « Nouvel employé » / « Nouveau
versement » et, par ligne, un menu d'actions accessible (cible 44 px,
`aria-label` explicite).

Les tiroirs et le menu sont fermés dans l'état capturé : la liste ne contient
donc aucun champ de saisie (test de rendu `employees-list.test.tsx` +
`no-inline-inputs.test.tsx`).

| Fichier | Contenu |
| --- | --- |
| `avant-list-{desktop,mobile}.png` | Liste sans actions de ligne |
| `apres-list-{desktop,mobile}.png` | Liste avec actions + en-tête |

Un COMPTABLE reçoit la même liste sans menu d'actions (comportement couvert par
le test de rendu, non capturé ici).