# Module Employés — hiérarchie visuelle (#442)

Ce document décrit la hiérarchie des écrans du module Employés : liste, fiche et
Paie du mois. Il sert de référence au manuel d'utilisation et aux prochaines
évolutions de l'interface.

## Le langage visuel

- **Tokens uniquement** : primaire violet, secondaire orange, `destructive`,
  `muted`, `border`, `card` de `app/globals.css`. Aucune couleur en dur, aucun
  thème sombre, aucune nouvelle dépendance.
- **En-tête identique partout** (`employes/_components/page-header.tsx`) :
  titre `text-2xl font-semibold`, sous-titre court en `text-muted-foreground`,
  action primaire à droite. Une ligne en bureau, empilé sous `sm`.
- **Surfaces douces** : `rounded-lg`, bordure `border` légère, `shadow-sm`
  discrète, espacements `gap-6` et `p-5`. Les montants sont en `tabular-nums`,
  alignés à droite.
- **La couleur ne dit jamais tout** : chaque état porte un libellé et une icône
  Lucide. Soldé = primaire, partiel = secondaire, en retard = destructif.
- **Tableaux → cartes sous `md`** : aucun débordement horizontal à 390 px.
- **Aucune saisie sur un écran de consultation** : les formulaires vivent dans
  des tiroirs (`Sheet`) ou des pages dédiées.

## La liste Employés

1. En-tête : « Employés », sous-titre « Effectif, rémunération et situation du
   mois », puis « Paie du mois » et, pour un ADMIN, « Nouvel employé »,
   « Nouveau versement ».
2. Deux groupes : **En poste**, puis **Sortis**. Une ligne = avatar à initiales,
   nom, poste, badges (emploi, état du mois, arriéré), puis la synthèse
   condensée Dû / Versé / Reste.
3. Chaque ligne ouvre la fiche. Le menu d'actions rapides (ADMIN seulement)
   propose Voir, Payer un salaire, Modifier, Ajouter un taux, Enregistrer une
   sortie / Réactiver. Un COMPTABLE ne voit aucune action d'écriture.
4. État vide : icône, phrase d'explication et bouton de création.

## La fiche employé

L'ordre des sections suit la fréquence d'usage, du plus consulté au moins
consulté :

1. **Synthèse** : bande visible sans défilement à 390 × 844 — avatar, nom,
   poste, statut, puis Dû / Versé / Reste / Arriéré / Solde d'avance. Chaque
   montant qui porte un enjeu est accompagné de son état libellé et iconographié.
2. **Derniers versements** : salaires, acomptes et avances, du plus récent au
   plus ancien, montants alignés à droite.
3. **Rémunération** : taux en vigueur puis historique daté (un taux ne s'écrase
   jamais).
4. **Dettes et avances** : arriéré des mois clôturés, mois par mois, puis solde
   d'avance restant à récupérer.
5. **Identité** : nom, poste, entrée, sortie, statut, note.

Plus aucun onglet monochrome : la fiche est une seule colonne de sections
nommées, sur mobile comme sur bureau.

## La Paie du mois

Même en-tête que la liste et la fiche. Le mois vit dans l'URL (`?mois=YYYY-MM`,
nuqs) et se navigue avec deux chevrons — **pas de `<select>`**, la règle des
écrans Employés interdit tout champ sur la page. Quatre cartes de synthèse
(Dû, Versé, Reste, Arriéré) précèdent le détail par employé : cartes sous `md`,
tableau dense au-delà, avec un état sémantique par ligne.

## Manuel d'utilisation — chapitres à modifier

Le manuel du personnel est le Doc Claude « Manuel d'utilisation – EBA Coffee
Shop » :

- **Chapitre 7 — Finances** : remplacer « Dépenses → onglet Salaires » par
  « Employés → Paie du mois » ; les captures de la vue du mois et du versement
  doivent être refaites.
- **Chapitre 11 — Administration (équipe)** : la création d'un employé, d'un
  taux, d'une sortie et d'une réactivation se fait désormais depuis la liste
  Employés (tiroirs), plus depuis Dépenses.
- **Tableau « Qui fait quoi » du chapitre 1.2** : ADMIN écrit (employés, taux,
  versements, avances, primes/retenues) ; COMPTABLE consulte Employés et la
  Paie du mois sans action d'écriture ; MANAGER et ANALYSTE ne voient qu'un
  montant global de salaires, sans détail nominatif.

## Vérifications

- `pnpm exec vitest run 'app/(dashboard)/dashboard/employes' lib/employees`
- `pnpm exec eslint 'app/(dashboard)/dashboard/employes'`
- Aucun `input`, `select`, `textarea` ni `form` rendu au repos sur la liste, la
  fiche et la Paie du mois (test de rendu).