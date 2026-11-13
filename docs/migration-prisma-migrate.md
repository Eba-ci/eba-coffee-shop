# Bascule sur `prisma migrate` (fin de l'ère « db push + pre-push »)

## Pourquoi

Avant, le schéma était appliqué par `prisma db push`, précédé du rejeu manuel de
migrations SQL maison (`scripts/db-pre-push.sh`) écrites avec `IF NOT EXISTS`.
Ce pattern casse dès qu'une migration référence une **colonne** déclarée dans un
`CREATE TABLE IF NOT EXISTS` (sauté sur une BDD existante) : le déploiement
échoue en prod alors qu'il passe en local. Trois déploiements sont tombés dessus.

Désormais : un **journal** (`_prisma_migrations`) — `prisma migrate deploy` en CD
n'applique que ce qui n'a jamais tourné, et ne rejoue plus rien.

## Ce qui a changé

- `prisma/migrations/20261113060000_baseline` : **consolidation** de tout le
  schéma actuel (générée par `prisma migrate diff --from-empty --to-schema
  prisma/schema.prisma --script`). Une seule migration = état complet.
- Les 41 migrations historiques sont déplacées dans
  `prisma/sql/legacy-migrations/` (référence uniquement ; ne plus les exécuter).
- `scripts/db-pre-push.sh` supprimé ; le CD (`deploy/deploy.sh`, action
  `schema`, staging et production) lance `db:migrate` (= `prisma migrate deploy`)
  à la place de `db:pre-push db:push`.
- En dev, créer une migration : `pnpm db:migrate:dev -- --name ma_migration`
  (génère le SQL depuis le schéma). `pnpm db:push` reste dispo en dépannage
  local, mais n'a plus rien à faire sur staging/production.

## Bascule, une fois par environnement (staging puis production)

À faire **avant le premier déploiement** qui utilise `db:migrate`, avec accès à
la BDD cible (`DATABASE_URL` de l'env) :

1. Vérifier que la BDD correspond exactement au schéma (elle doit être à jour
   via un dernier déploiement en mode `db push`) :
   ```sh
   pnpm exec prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-schema prisma/schema.prisma
   ```
   → « No difference » attendu. Si différence : déployer master d'abord
   (l'ancien pipeline `db push` la corrige), puis re-vérifier.
2. Marquer la baseline comme déjà appliquée (n'exécute **rien** en BDD) :
   ```sh
   pnpm exec prisma migrate resolve --applied 20261113060000_baseline
   ```
3. Les déploiements suivants appliquent uniquement les **nouvelles** migrations.

> Si un déploiement part avant l'étape 2 : `migrate deploy` tente d'appliquer la
> baseline sur une BDD pleine et échoue (`CREATE TABLE` sur table existante).
> Aucune perte de données ; il suffit de faire l'étape 2 puis relancer.

## Nouvelle migration (routine)

```sh
pnpm db:migrate:dev -- --name add_chose      # en dev : génère + applique
git push                                      # le CD applique en staging/prod
```

Attention aux données : une migration `migrate dev` est jouée **une seule fois**
par environnement — écrire les conversions de données dans le SQL généré
(`prisma/migrations/<ts>_<name>/migration.sql`) avant de pusher, en pensant aux
lignes déjà présentes en prod.
