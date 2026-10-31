# Déploiement Docker

État : **staging uniquement**. La production reste sur `cd.yml` (pm2, `git pull` + build sur le VPS).

**Un seul conteneur par environnement.** Pas de blue/green : le remplacement du conteneur coupe le site quelques secondes (comparable au `pm2 startOrReload` actuel). Les flux de la cuisine et de la caisse se reconnectent seuls, et un onglet ouvert pendant un déploiement recharge une fois (`lib/chunk-error.ts`).

## Principe

1. Un push sur la branche `staging` lance `.github/workflows/cd-staging.yml`.
2. Le job `build` construit Next (`BUILD_STANDALONE=1`) contre un Postgres de service, puis publie deux images sur GHCR : `ghcr.io/<dépôt>:sha-<commit>` (exécution) et `…-tools:sha-<commit>` (schéma BDD).
3. Le job `deploy` exécute `deploy/deploy.sh` sur le serveur (SSH) :
   pull → schéma BDD (l'ancien conteneur sert encore) → remplacement du conteneur `eba-staging` → attente de `/api/health` → réchauffage des pages → enregistrement du tag.
4. Si le nouveau conteneur n'est pas sain, le script relance le tag précédent et sort en erreur.

Port : **2001** (lié à `127.0.0.1`, derrière nginx). Le tag en service est dans `/var/lib/eba/staging/current`, le précédent dans `previous`.

**Rollback** : _Actions → CD Staging → Run workflow → rollback_, ou `bash deploy.sh rollback staging` sur le serveur. Il relance le tag précédent ; le schéma de la base n'est **pas** défait.

## Pourquoi `__VARLOCK_ENV` (à ne pas casser)

`next build` fige dans `.next/server/chunks/[turbopack]_runtime.js` toutes les valeurs varlock vues au build, **et elles écrasent l'environnement du conteneur au démarrage**. Donc : le build CI utilise des valeurs factices (aucun secret dans l'image) et `deploy/docker-entrypoint.sh` calcule `__VARLOCK_ENV` (`varlock load --format json-full`) avec les vraies variables du conteneur, qui prend alors le dessus. Une configuration invalide arrête le conteneur. Seules les variables `NEXT_PUBLIC_*` sont réellement figées au build, d'où **une image par environnement**.

## Pourquoi le réchauffage

L'image est construite sur une base **vide** : les pages prérendues contiennent les valeurs par défaut des réglages (coordonnées, horaires), et celles sans `revalidate` (`/cgv`, `/contact`, `/a-propos`…) ne se régénèrent jamais seules. Après le démarrage, `deploy.sh` appelle `POST /api/internal/revalidate` (secret `CRON_SECRET`) : tout l'arbre est invalidé et la route renvoie la liste des pages prérendues (lue dans `prerender-manifest.json`), que le script requête une fois chacune. Pendant ces quelques secondes, les pages affichent encore les valeurs du build. `CRON_SECRET` est donc **obligatoire** dans `staging.env` (le script refuse de déployer sans).

## Préparation du serveur (une fois)

- Docker, et un utilisateur de déploiement dans le groupe `docker`.
- Dossiers : `sudo install -d -o <user> /var/lib/eba/staging /etc/eba`.
- `/etc/eba/staging.env` d'après `deploy/staging.env.example` (chmod 600, **sans guillemets**). Il doit contenir `APP_ENV=staging` et une `DATABASE_URL` dont le nom de base contient « staging » (sinon le conteneur refuse de démarrer).
- Base : provisionnée et restaurée avec Portabase, puis **anonymisée avant le premier déploiement**. Le conteneur doit pouvoir la joindre (`host.docker.internal` si elle est sur l'hôte : `listen_addresses` et `pg_hba.conf` pour le pont Docker). Vérifier `max_connections`.
- nginx : le vhost `staging.eba-coffee.com` envoie déjà tout vers `http://127.0.0.1:2001`. Il doit aussi : poser `X-Forwarded-For/Proto`, désactiver le tampon (`proxy_buffering off`, `proxy_read_timeout` long) pour les flux SSE `/api/preparation/stream` et `/api/caisse/stream`, activer l'authentification basique et `X-Robots-Tag: noindex`.
- Secrets GitHub (environnement `staging`) : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` ; variables : `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, `NEXT_PUBLIC_WAVE_MERCHANT_ID`.
- Serveur Jèko factice : `pnpm jeko:mock` sur l'hôte (port 4010) avec les clés de `staging.env` et `JEKO_MOCK_WEBHOOK_URL=https://staging.eba-coffee.com/api/webhooks/jeko`.

## Règles

- **Schéma BDD additif seulement** : l'ancien conteneur sert encore pendant `db push`, et un rollback relance l'ancien code sur le schéma neuf. Une suppression ou un renommage se fait en deux déploiements (expand puis contract). `db push` n'est jamais lancé avec `--accept-data-loss`.
- Aucun cron n'est planifié en staging : `CRON_SECRET` ne sert qu'au réchauffage.
- Le conteneur tourne sans capabilities (`--cap-drop ALL`) et avec `no-new-privileges`. Le plancher de version Node est dans le `Dockerfile` (`NODE_MIN_VERSION`) : le relever à chaque avis de sécurité Node.js.

## Limites connues

- Coupure de quelques secondes à chaque déploiement ; les flux SSE sont coupés et se reconnectent.
- Les limiteurs de débit et throttles (`lib/rate-limit.ts`, `lib/jeko/expiry.ts`) sont par processus : remis à zéro à chaque déploiement.
- Le cache des pages vit dans le conteneur : un conteneur recréé repart du HTML de l'image, d'où le réchauffage à chaque déploiement.
- Un webhook Jèko reçu pendant la coupure échoue ; Jèko réessaie (3 envois) et désactive le webhook après 15 échecs consécutifs : éviter de déployer pendant un paiement en cours.
