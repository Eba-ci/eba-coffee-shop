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
pnpm db:migrate-salary-fixed-costs                      # simulation (défaut)
pnpm db:migrate-salary-fixed-costs --apply --confirm    # retire réellement
pnpm db:migrate-salary-fixed-costs --apply --confirm --backup /chemin/dir
```

- **Simulation par défaut** : le script liste les charges « salaires »
  concernées (libellé, montant, périodicité) et **ne modifie rien**.
- Il identifie une charge comme salaire si sa **catégorie** est « Salaires »
  (`SALARY_EXPENSE_CATEGORY_NAME`) **ou** si son **libellé** contient
  « salaire » — casse et accents ignorés.
- **Idempotent** : un second passage ne trouve plus rien à retirer.

## ⚠️ Danger — à lire avant `--apply`

Une fois les charges retirées, le total **« Salaires du mois »** du point mort
**tombe à 0 TANT QUE l'admin n'a pas saisi les employés et leurs taux** dans
l'onglet Salaires. Le script :

1. **refuse** `--apply` sans `--confirm` ;
2. **affiche les montants à ressaisir** (somme des montants par période) ;
3. écrit une **sauvegarde JSON** des charges retirées, **hors du dépôt**
   (par défaut `~/eba-backups/charges-salaires-<horodatage>.json`), dont le
   chemin est affiché — de quoi restaurer les charges si besoin.

L'ordre recommandé est donc : **saisir les employés et taux d'abord**, puis
retirer les charges. À défaut, prévenir l'admin de l'impact avant la migration.

## Restaurer

La sauvegarde JSON est un simple tableau `charges` (id, libellé, montant,
périodicité, catégorie, dates, actif). Recréer les charges concernées depuis
Dépenses → Point mort (ou via MCP `create_fixed_cost`) ou une commande Prisma.

## Déploiement

Sur **staging puis production** (voir `docs/deploiement.md`) :

1. `pnpm db:push` — migrations `20261111090000_add_fixed_cost`,
   `20261112090000_add_fixed_cost_schedule`, `20261113090000_add_salary_model`.
2. L'admin saisit les employés et leurs taux dans l'onglet Salaires.
3. `pnpm db:migrate-salary-fixed-costs`, puis `--apply --confirm` une fois le
   rapport relu.
4. « Importer depuis les récurrentes » si besoin (idempotent).

Le script ne se lance **jamais** automatiquement : c'est un geste explicite,
jamais contre une base non identifiée.
