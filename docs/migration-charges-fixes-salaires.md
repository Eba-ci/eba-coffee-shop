# Migration des charges fixes « salaires » (#407 → #409)

## Pourquoi

Avant #409, les salaires pouvaient être saisis comme de simples **charges
fixes** (catégorie « Salaires » ou libellé contenant « salaire »). Depuis #409,
la rubrique Salaires est **réservée à l'ADMIN** : les salaires se saisissent en
**employés + taux**, et le point mort lit leur **total mensuel global**
(`getMonthlySalaryTotal`, un seul nombre, sans employé).

Les anciennes charges « salaires » doivent donc être **retirées de la liste des
charges fixes** : sinon le point mort les compterait en double (comme charge
fixe, puis comme total de salaires).

## Le script

```
pnpm db:migrate-salary-fixed-costs                          # simulation (défaut)
pnpm db:migrate-salary-fixed-costs --apply --confirm        # retire réellement
pnpm db:migrate-salary-fixed-costs --apply --confirm --backup /chemin/sauvegarde.json
pnpm db:migrate-salary-fixed-costs --restore <sauvegarde.json>            # simulation
pnpm db:migrate-salary-fixed-costs --restore <sauvegarde.json> --apply --confirm  # restaure
```

- **Simulation par défaut** : le script liste les charges « salaires »
  concernées (libellé, montant, périodicité) et **ne modifie rien**.
- **Un seul prédicat d'identification** : catégorie « Salaires »
  (`SALARY_EXPENSE_CATEGORY_NAME`) **ou** libellé contenant « salaire » — casse
  et accents ignorés.
- **Idempotent** : un second passage ne trouve plus rien à retirer.

## ⚠️ Danger — à lire avant `--apply`

Une fois les charges retirées, le total **« Salaires du mois »** du point mort
**tombe à 0 TANT QUE l'admin n'a pas saisi les employés et leurs taux** dans
l'onglet Salaires. Le script :

1. **refuse** `--apply` sans `--confirm` ;
2. **affiche les montants à ressaisir, regroupés par périodicité** (un montant
   hebdomadaire, mensuel et annuel ne s'additionnent pas) ;
3. écrit une **sauvegarde JSON complète** de chaque charge retirée — **tous les
   champs de `FixedCost`** (`categoryId`, `note`,
   `sortOrder`…) **et ses échéances** (`FixedCostInstallment`) — **hors du
   dépôt** (par défaut
   `~/eba-backups/charges-salaires-<horodatage>.json`), dont le chemin est
   affiché.

## Restaurer

`--restore <fichier>` recrée les charges de la sauvegarde : **simulation par
défaut**, `--apply --confirm` pour écrire. **Idempotent** : une charge dont
l'`id` existe déjà n'est pas recréée. Champs, échéances et ordre d'affichage
sont restaurés à l'identique.

```
pnpm db:migrate-salary-fixed-costs --restore ~/eba-backups/charges-salaires-XXXX.json
pnpm db:migrate-salary-fixed-costs --restore ~/eba-backups/charges-salaires-XXXX.json --apply --confirm
```

## Suppression des récurrentes (#417)

L'onglet « Récurrentes », la table `RecurringExpense` et la colonne
`FixedCost.recurringExpenseId` sont supprimés ; l'import des charges fixes se
fait par catégories `FIXED` (« Importer les catégories fixes », #433).

La migration `20261116090000_drop_recurring_expense` (SQL, idempotente) reprend
d'abord les récurrentes **actives avec montant** comme charges fixes
mensuelles (prise d'effet = 1er du mois courant), **sans doublon** :

- les récurrentes « salaires » (même prédicat que ci-dessus) sont ignorées ;
- une catégorie qui porte déjà une charge fixe (import #433, charge manuelle)
  n'en reçoit pas une seconde ; une seule charge par catégorie ;
- pour une catégorie `FIXED`, la charge reprend `importedCategoryId` : le bouton
  d'import ne la recrée pas ;
- les récurrentes sans montant sont perdues (rien à reprendre) : à recréer au
  besoin depuis l'onglet Point mort.

Puis elle supprime la colonne et la table. **Sauvegarder la base avant
`db:push`** si les récurrentes comptent.

## Déploiement

Sur **staging puis production** (voir `docs/deploiement.md`) :

1. `pnpm db:push` — migrations `20261111090000_add_fixed_cost`,
   `20261112090000_add_fixed_cost_schedule`, `20261113090000_add_salary_model`,
   `20261116090000_drop_recurring_expense` (reprise des récurrentes, voir ci-dessus).
2. L'admin **saisit les employés et leurs taux** dans l'onglet Salaires (sinon
   « Salaires du mois » reste à 0 une fois les charges retirées).
3. **Simuler** : `pnpm db:migrate-salary-fixed-costs`, puis relire le rapport
   (charges concernées, montants par périodicité).
4. **Retirer** : `pnpm db:migrate-salary-fixed-costs --apply --confirm`.
5. « Importer les catégories fixes » si besoin (idempotent ; « Salaires » est
   ignorée).

En cas d'erreur, restaurer depuis la sauvegarde affichée à l'étape 4 :
`pnpm db:migrate-salary-fixed-costs --restore <sauvegarde.json>` (simulation,
puis `--apply --confirm`).

Le script ne se lance **jamais** automatiquement : c'est un geste explicite,
jamais contre une base non identifiée.
