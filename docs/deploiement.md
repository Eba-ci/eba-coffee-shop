# Déploiement Docker

État : **staging** (`cd-staging.yml`, branche `staging`) et **production** (`cd.yml`, branche `master`, après la CI). L'ancien déploiement pm2 est gardé en secours manuel (`cd-pm2-legacy.yml`).

Un seul conteneur par environnement, sans Docker Compose ni blue/green : le remplacement coupe le site quelques secondes. Docker tourne en **rootless** sous l'utilisateur `deploy`.

## Principe

Un push sur la branche `staging` lance `.github/workflows/cd-staging.yml` :

0. **CI** : `ci.yml` (lint, types, tests) en premier ; un échec arrête tout, aucune image n'est construite. La même CI tourne sur les PR vers `staging` ou `master`. Le rollback manuel n'y passe pas.
1. **tools** : image `…-tools:sha-<commit>` (Prisma + tsx pour le schéma).
2. **schema** (SSH, `deploy.sh schema`) : `db:push` & co. sur la base de staging, puis `db:backfill-stock-baseline` (relevé de départ du journal de stock, idempotent). Avant le build, car le prérendu lit la base avec le nouveau code.
3. **image** : tunnel SSH vers Postgres, puis `docker build --network host` (cible `runner`) : le prérendu de `next build` lit `eba_staging` avec le rôle `eba_build`, en lecture seule.
4. **deploy** (SSH, `deploy.sh deploy`) : pull, remplacement du conteneur `eba-staging`, attente de `/api/health`, retour au tag précédent si le nouveau n'est pas sain.

Production : même pipeline, après la CI de `master` (`workflow_run`, commit exact validé), environnement GitHub `production`, conteneur `eba-production` sur le port **3001** (celui de pm2 : nginx ne change pas), 1 Go / 1,5 CPU, état dans `~/.local/state/eba/production`. Le schéma suit `db:merge-duplicate-emails`, `db:push`, `db:trigger`, `db:indexes` ; le relevé de départ du stock reste manuel. `deploy.sh` refuse un `.env.production` qui définit `APP_ENV` ou pointe vers une base « staging ». Les uploads historiques (`/var/www/eba-coffee/public/uploads`) sont montés en lecture seule dans `/app/public/uploads` (fichiers lisibles par « others »).

Staging : port **2001** (`127.0.0.1`, derrière nginx). Tag en service : `~/.local/state/eba/staging/current`, précédent : `previous`.

**Rollback** : _Actions → CD Staging → Run workflow → rollback_, ou `bash deploy.sh rollback staging`. Le schéma de la base n'est pas défait.

## Accès à la base pendant le build

Le Dockerfile suit `with-docker` (deps → builder → runner). L'URL de la base arrive par secret BuildKit (`db_url`), jamais dans une couche. Les autres valeurs du build sont factices (`deploy/build.env`) ; les `NEXT_PUBLIC_*` viennent des variables GitHub.

- Utilisateur système `eba-tunnel` (sans shell) ; sa clé n'autorise que `permitopen="127.0.0.1:5432"`.
- Rôle `eba_build` (`CONNECTION LIMIT 10` : le prérendu ouvre jusqu'à 2 connexions par processus, `DATABASE_POOL_MAX`) : `SELECT` sur les tables lues par les pages publiques (réglages, menu, sondages, TikTok) et sur 6 colonnes de `order` (`id`, `items`, `dailyDate`, `status`, `paymentExpiresAt`, `isPaid`) ; connexion limitée à `eba_staging` (`pg_hba.conf`).
- Secrets GitHub (environnement `staging`) : `DB_TUNNEL_KEY`, `BUILD_DATABASE_URL` ; communs au dépôt : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Variables : `VPS_HOST_FINGERPRINT` (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, `NEXT_PUBLIC_WAVE_MERCHANT_ID`.
- Test du tunnel : workflow `test-db-tunnel.yml` (manuel).

`next build` fige le `DATABASE_URL` dans `.next` : `deploy/redact-build-url.mjs` le retire juste après le build (et fait échouer le build s'il en reste une trace). Les pages statiques se régénèrent toutes les heures (`revalidate` du layout racine).

## Pourquoi `__VARLOCK_ENV`

`next build` fige les valeurs varlock vues au build, et elles écrasent l'environnement du conteneur. `deploy/docker-entrypoint.sh` recalcule `__VARLOCK_ENV` avec les vraies variables ; une configuration invalide arrête le conteneur. Seules les `NEXT_PUBLIC_*` sont réellement figées : **une image par environnement**.

## Préparation du serveur (une fois)

- Docker rootless pour `deploy` (`loginctl enable-linger deploy`, `slirp4netns`). Override systemd : `DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns` et `DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=false`. Le conteneur joint Postgres par `10.0.2.2` (`host.docker.internal`), Postgres reste sur `127.0.0.1`.
- `/var/www/eba-coffee/.env.staging` d'après `deploy/staging.env.example` (chmod 600).
- Base `eba_staging` : copie de la prod (`pg_dump`), **anonymisée avant tout accès** par `psql -v ON_ERROR_STOP=1 -1 -d eba_staging -f deploy/anonymize-staging.sql` (rejouable, refuse une base sans « staging »), propriétaire `eba_staging`. `ADMIN_EMAIL` de `.env.staging` = votre e-mail : le compte est créé et promu ADMIN à la première connexion (code `000000`).
- `pg_hba.conf` : le rôle `eba_build` ne doit pas pouvoir se connecter à la base de production.
- nginx : `staging.eba-coffee.com` vers `http://127.0.0.1:2001`, `X-Forwarded-*`, `proxy_buffering off` pour `/api/preparation/stream` et `/api/caisse/stream`, authentification basique, `X-Robots-Tag: noindex`.
- Serveur Jèko factice : `pnpm jeko:mock` (port 4010).

## Règles

- **Schéma BDD additif seulement** : l'ancien conteneur sert pendant `db push` et un rollback relance l'ancien code sur le schéma neuf. Suppression ou renommage en deux déploiements. Jamais `--accept-data-loss`.
- Une colonne ajoutée à une table lue par les pages publiques doit aussi être couverte par le `GRANT` de `eba_build`.
- Le conteneur tourne avec `--cap-drop ALL` et `no-new-privileges`. Plancher Node : `NODE_MIN_VERSION` du `Dockerfile`, à relever à chaque avis de sécurité.

## Limites connues

- Coupure de quelques secondes à chaque déploiement ; les flux SSE se reconnectent.
- Limiteurs de débit et throttles par processus : remis à zéro à chaque déploiement.
- Après un rollback, la première visite d'une page peut voir les données de l'ancien build, puis la page se rafraîchit.
- Un webhook Jèko reçu pendant la coupure échoue ; Jèko réessaie 3 fois et désactive le webhook après 15 échecs : éviter de déployer pendant un paiement.

## Bascule de la production (pm2 → Docker, une fois)

À préparer **avant** de fusionner dans `master` (sinon le premier push construit une image sans que le serveur soit prêt) :

1. **Base de build** : créer un rôle de build **dédié à la prod** (même modèle que `eba_build`, `SELECT` seulement, `CONNECTION LIMIT 10`) et l'autoriser dans `pg_hba.conf` sur la base de prod uniquement ; vérifier que `eba_build` (staging) ne s'y connecte toujours pas.
2. **Secrets/variables GitHub, environnement `production`** : secrets `DB_TUNNEL_KEY` (clé `eba-tunnel`, limitée à `permitopen="127.0.0.1:5432"`) et `BUILD_DATABASE_URL` ; variables `VPS_HOST_FINGERPRINT`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, `NEXT_PUBLIC_WAVE_MERCHANT_ID` (valeurs de prod ; une image par environnement).
3. **Serveur** : `/var/www/eba-coffee/.env.production` d'après `deploy/production.env.example` (chmod 600, sans guillemets) ; `public/uploads` lisible (`chmod -R o+rX`) ; sauvegarde `pg_dump` de la prod.
4. **Coupure** : le port 3001 est pris par pm2. Au moment de la bascule : `pm2 stop eba-coffee-shop`, puis lancer le déploiement (_Actions → CD → Run workflow → deploy_, ou le merge). Si le conteneur n'est pas sain, `deploy.sh` échoue sans rien casser : `pm2 start eba-coffee-shop` remet l'ancien site (après `docker rm -f eba-production`).
5. Une fois stable : `pm2 delete eba-coffee-shop`, supprimer `cd-pm2-legacy.yml` et `ecosystem.config.cjs`.
6. Webhook Jèko : éviter de déployer pendant un paiement (voir limites).
