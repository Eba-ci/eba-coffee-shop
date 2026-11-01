# Déploiement Docker

État : **staging uniquement**. La production reste sur `cd.yml` (pm2, `git pull` + build sur le VPS).

Un seul conteneur par environnement, sans Docker Compose ni blue/green : le remplacement coupe le site quelques secondes. Docker tourne en **rootless** sous l'utilisateur `deploy`.

## Principe

Un push sur la branche `staging` lance `.github/workflows/cd-staging.yml` :

1. **tools** : image `…-tools:sha-<commit>` (Prisma + tsx pour le schéma).
2. **schema** (SSH, `deploy.sh schema`) : `db:push` & co. sur la base de staging. Avant le build, car le prérendu lit la base avec le nouveau code.
3. **image** : tunnel SSH vers Postgres, puis `docker build --network host` (cible `runner`) : le prérendu de `next build` lit `eba_staging` avec le rôle `eba_build`, en lecture seule.
4. **deploy** (SSH, `deploy.sh deploy`) : pull, remplacement du conteneur `eba-staging`, attente de `/api/health`, retour au tag précédent si le nouveau n'est pas sain.

Port **2001** (`127.0.0.1`, derrière nginx). Tag en service : `~/.local/state/eba/staging/current`, précédent : `previous`.

**Rollback** : _Actions → CD Staging → Run workflow → rollback_, ou `bash deploy.sh rollback staging`. Le schéma de la base n'est pas défait.

## Accès à la base pendant le build

Le Dockerfile suit `with-docker` (deps → builder → runner). L'URL de la base arrive par secret BuildKit (`db_url`), jamais dans une couche. Les autres valeurs du build sont factices (`deploy/build.env`) ; les `NEXT_PUBLIC_*` viennent des variables GitHub.

- Utilisateur système `eba-tunnel` (sans shell) ; sa clé n'autorise que `permitopen="127.0.0.1:5432"`.
- Rôle `eba_build` : `SELECT` sur les tables lues par les pages publiques (réglages, menu, sondages, TikTok) et sur 5 colonnes de `order` ; connexion limitée à `eba_staging` (`pg_hba.conf`).
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
