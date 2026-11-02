# Banc d'essai de concurrence du stock

Rejoue des collisions (« deux commandes à la même seconde », cent lancements d'un
coup…) sur les **vraies fonctions** du dépôt et une **vraie base Postgres**, puis
vérifie que le stock, le journal et l'audit (`lib/stock-history`) concordent.
Une race condition vit dans les verrous de Postgres : le même code sur une base
locale la reproduit mieux et plus vite qu'un test HTTP sur un serveur distant.

## Lancer

```bash
createdb eba_race   # le nom DOIT contenir « race » ou « test » : le script refuse sinon
export DATABASE_URL=postgresql://user:pass@localhost:5432/eba_race
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS citext;'
pnpm db:push && pnpm db:trigger && pnpm db:indexes
DATABASE_POOL_MAX=60 pnpm test:race                     # tous les scénarios
DATABASE_POOL_MAX=60 RACE_ONLY=s3,s7 pnpm test:race     # certains seulement (préfixe de nom)
DATABASE_POOL_MAX=60 RACE_N=300 pnpm test:race          # plus de parallélisme
```

`DATABASE_POOL_MAX` fixe le nombre de connexions du processus : sans lui, 10, et la
charge n'est pas vraiment simultanée. `max_connections` de Postgres doit être plus grand.
Code de sortie : `0` tout passe, `1` un scénario échoue, `2` base refusée.

## Scénarios

|     | Ce qu'on provoque                                       | Ce qui doit rester vrai                       |
| --- | ------------------------------------------------------- | --------------------------------------------- |
| S1  | 3 caisses vendent le dernier stock (création + cuisine) | autant de ventes que de stock, jamais négatif |
| S1b | 100 lancements simultanés, stock 20                     | exactement 20 ventes                          |
| S2  | la même commande lancée 30 fois (double clic)           | décomptée une seule fois                      |
| S3  | commandes « A,B » et « B,A » lancées ensemble           | aucun interblocage, stock exact               |
| S4  | 90 commandes sur 3 goûts à 10                           | exactement 30 ventes, goûts à 0               |
| S5  | ventes pendant des réapprovisionnements                 | stock = départ + réappros − ventes            |
| S6  | annulation et lancement de la même commande             | stock cohérent avec les statuts               |
| S7  | 2 à 50 créations simultanées                            | aucune commande perdue (numéro du jour)       |
| S8  | encaissement et lancement de la même commande           | décomptée une seule fois                      |
| S9  | modification d'articles et lancement                    | aucun interblocage, stock = contenu final     |
| S10 | remises en stock de remboursements croisées             | aucun interblocage, stock exact               |
| S11 | réservations des programmées + lancements + réappros    | stock + réservé + lancé = départ + réappros   |

Après les scénarios, l'audit du dépôt doit ne signaler **aucun** défaut, aucun écart
avec le journal, aucun stock négatif.

## Ajouter un scénario

Dans `scenarios.ts` : créer les produits (`mkProduct`), **préparer les commandes une
à une** (`pre`, la numérotation concurrente se mesure à part dans S7), les lancer avec
`burst([...])` (barrière de départ commune), puis `report({...})` avec un verdict
calculé sur un **invariant** (conservation du stock), pas sur « ça n'a pas planté ».

## Ce qu'on a trouvé avec (et corrigé)

1. **Interblocage au lancement** : deux commandes aux mêmes produits dans un ordre
   différent se bloquaient (Postgres en abandonnait une). Verrou ordonné
   (`lockStockRows`, `lib/stock-history/lock.ts`).
2. **Commandes perdues à la création** dès 4 simultanées (numéro du jour « max + 1 » +
   3 retries immédiats). Verrou consultatif par jour (`getNextDailyNumber`).
3. **Modification d'articles contre lancement** : ordre de verrous inversé (stock puis
   commande). La commande d'abord, partout.
4. **Lancement sur un contenu périmé** : le contenu lu avant la transaction était
   décompté même si une modification avait été validée entre-temps (stock faux, sans
   erreur). Le contenu est relu sous verrou (`reserveStockOnce`).

## Limites

Un seul processus Node : la concurrence est réelle côté Postgres (60 connexions), pas
côté Node. Rien n'est testé sur HTTP (authentification, réseau, Cloudflare). Les
chemins Jèko (paiement en ligne, expiration, paiement tardif) ne sont pas encore couverts.
