# Passage à Docker (EBA Coffee Shop) : rapport de passation

Rédigé le 2026-11-01 pour qu'un autre Claude reprenne le sujet sur un autre dépôt (monorepo : 3 fronts Next.js + 1 backend NestJS) hébergé sur **le même serveur**. Le détail d'exploitation propre à ce dépôt est dans `docs/deploiement.md`. Ici : ce qu'on a décidé, pourquoi, ce qui a cassé, et comment le transposer.

**Légende.** ✅ vérifié de bout en bout · 🧪 vérifié en local seulement · ❓ non vérifié.

## 1. État au moment de la passation

- **Seul le staging** est en Docker. La production reste sur `pm2` (`git pull` + build sur le VPS, port 3001).
- Branches et PR : PR 385 (travail de base) ⊂ PR 386 (branche `claude/sharp-archimedes-lpfc2g`, ouverte). La branche `staging` = PR 386 + PR 381 (journal de stock, fusionnée à la main pour test). Un push sur `staging` déclenche le déploiement.
- Un déploiement complet tourne de bout en bout ✅ (4 jobs verts, conteneur sain sur `/api/health`).
- **Reste à faire côté serveur** : activer le vhost nginx de staging dans `sites-enabled` (sinon `staging.eba-coffee.com` est servi par la prod), authentification basique, réglage des flux SSE.
- Jamais exécuté ❓ : le rollback, l'effet réel des limites `--memory`/`--cpus` en rootless, la migration de la prod.

## 2. Architecture retenue

```text
git push staging
  └─ GitHub Actions (cd-staging.yml, environnement « staging »)
       1. tools   : image …-tools:sha-<commit> (Prisma + tsx, pour le schéma)
       2. schema  : SSH → deploy.sh schema   (db push & co. sur la base de staging)
       3. image   : tunnel SSH → Postgres, docker build --network host → image …:sha-<commit>
       4. deploy  : SSH → deploy.sh deploy   (pull, remplace le conteneur, attend /api/health)
  Serveur (utilisateur « deploy », Docker ROOTLESS, sans compose)
       nginx (443, Cloudflare devant) → 127.0.0.1:2001 → conteneur eba-staging
       conteneur → Postgres de l'hôte via 10.0.2.2 (reste sur 127.0.0.1)
```

Un seul conteneur par environnement (blue/green abandonné : coupure de quelques secondes, comparable à `pm2 reload`). Les images sont poussées sur GHCR avec le tag `sha-<commit>` ; le tag en service et le précédent sont dans `~/.local/state/eba/staging/{current,previous}`.

## 3. Décisions clés et raisons

| Décision                                                               | Raison                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Pas de Docker Compose sur le serveur                                   | Demande du propriétaire ; `docker run` + un script suffit pour un conteneur par environnement.                              |
| Dockerfile `deps → builder → runner` (modèle `with-docker` de Next.js) | Standard, cache de couches efficace, image finale légère (`output: 'standalone'`, utilisateur `node`).                      |
| Build dans la CI, pas sur le VPS                                       | Le VPS a déjà eu des OOM (exit 137) au `next build`.                                                                        |
| Docker **rootless** pour `deploy`                                      | Le groupe `docker` équivaut à root ; une clé SSH de CI volée aurait pris tout le serveur.                                   |
| Le build lit la vraie base de staging via un tunnel SSH                | Les layouts lisent la base : `next build` plante sans elle, et une base vide figerait les valeurs par défaut dans le HTML.  |
| Rôle SQL `eba_build` en lecture seule, colonnes limitées               | Moindre privilège : le build ne doit rien voir de personnel.                                                                |
| Schéma BDD appliqué **avant** le build                                 | Le prérendu lit la base avec le nouveau code ; une colonne ajoutée la ferait échouer. Donc schéma additif seulement.        |
| `revalidate = 3600` dans le layout racine                              | Sinon les pages statiques sans `revalidate` restent figées jusqu'au prochain déploiement. Plus de crawl de « réchauffage ». |
| Empreinte du serveur contrôlée par `ssh-keyscan` + comparaison         | Une clé collée à la main s'est révélée fausse deux fois.                                                                    |

## 4. Le problème central : le prérendu sans base

**Symptôme.** `next build` exécute des requêtes Prisma pour les pages publiques (réglages, menu, sondages). Un `docker build` n'a pas de réseau vers Postgres.

**Options examinées.** (A) build dans Docker contre une base de CI vide ; (B) A + `revalidate` partout ; (C) rendre les lecteurs dynamiques au build ; (D) build sur le serveur contre la vraie base ; (E) `cacheComponents` + Suspense ; (F) cache ISR dans Postgres.

**Choix.** Variante de D sans construire sur le VPS : la CI ouvre un tunnel SSH restreint (`permitopen="127.0.0.1:5432"`, utilisateur `eba-tunnel` sans shell) et construit avec `--network host`. L'URL passe par un **secret BuildKit** (`--mount=type=secret`). Le staging étant une copie **anonymisée** de la prod, rien de personnel ne traverse la CI.

**Piège non évident.** `next build` fige les valeurs varlock résolues dans `.next/server/chunks/[turbopack]_runtime.js`, `DATABASE_URL` compris : le secret se retrouve dans l'image malgré BuildKit. `deploy/redact-build-url.mjs` le remplace juste après le build et fait échouer le build s'il en reste. Au démarrage, `deploy/docker-entrypoint.sh` recalcule `__VARLOCK_ENV` avec les vraies variables (prioritaires).

## 5. Mise en place du serveur (ordre à respecter)

1. **Docker rootless** : paquets `uidmap dbus-user-session slirp4netns docker-ce-rootless-extras` ; `loginctl enable-linger deploy` ; depuis une vraie session (`ssh deploy@localhost`, pas `su`) : `dockerd-rootless-setuptool.sh install`. Override systemd utilisateur : `DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns` et `…_DISABLE_HOST_LOOPBACK=false`. Dans `~/.bashrc` : `XDG_RUNTIME_DIR=/run/user/$(id -u)` (calculé, jamais hérité) et `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock`.
2. **Base** : `pg_dump | psql` de la prod vers `eba_staging` (jamais `CREATE DATABASE … TEMPLATE` : la source est utilisée). Propriétaire `eba_staging` (`ALTER … OWNER` par objet : `REASSIGN OWNED BY postgres` est impossible). **Anonymiser avant tout accès** : `deploy/anonymize-staging.sql` (transaction unique, refuse hors base « staging », rejouable, vérifie qu'il ne reste rien de réel).
3. **Rôles** : `eba_staging` (application) ; `eba_build` (`CONNECTION LIMIT 10`, `default_transaction_read_only`, `SELECT` sur 13 tables + 6 colonnes de `order`). `pg_hba.conf` : règles `reject` de ces rôles vers la base de prod **placées avant** la règle générale `host all all 127.0.0.1/32` (première correspondance gagnante), puis `pg_reload_conf()`.
4. **Tunnel** : utilisateur `eba-tunnel` (`nologin`), `authorized_keys` avec `restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/bin/false"`, bloc `Match User` dans `sshd_config`.
5. **Fichier d'environnement** : `/var/www/eba-coffee/.env.staging`, sans guillemets, `chmod 600`, avec `APP_ENV=staging` (garde-fou : OTP fixe `000000`, e-mails coupés, `robots.txt` fermé, refus de démarrer si le nom de base ne contient pas « staging »).
6. **nginx** : `proxy_pass 127.0.0.1:2001`, **lien dans `sites-enabled`**, `auth_basic`, `X-Robots-Tag`, `proxy_buffering off` pour les flux SSE, webhook de paiement hors `auth_basic`.

## 6. CI/CD : secrets et variables (environnement GitHub « staging »)

- Secrets d'environnement : `DB_TUNNEL_KEY` (clé privée du tunnel), `BUILD_DATABASE_URL`. Au niveau dépôt : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
- Variables : `VPS_HOST_FINGERPRINT`, `NEXT_PUBLIC_*` (obligatoires au build : varlock refuse une valeur vide).
- Restreindre l'environnement à la branche `staging`. Le workflow `test-db-tunnel.yml` (manuel) vérifie le tunnel, la lecture seule et le refus d'accès à la prod.
- `workflow_dispatch` n'est lançable que si le fichier existe sur la branche par défaut ; pour tester avant, ajouter temporairement un déclencheur `push` limité à la branche de travail.

## 7. Pièges rencontrés (cause → correctif)

| #   | Symptôme                                                                 | Cause                                                                 | Correctif                                                      |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `Host key verification failed`                                           | secret `VPS_HOST_KEY` mal collé (autre clé)                           | contrôle d'empreinte `ssh-keyscan`                             |
| 2   | 404 sur `gh secret set --env`                                            | environnement GitHub inexistant                                       | le créer d'abord                                               |
| 3   | `TooManyConnections` au build                                            | `CONNECTION LIMIT 2` vs workers de prérendu (pool 10 chacun)          | `DATABASE_POOL_MAX=2` + limite 10                              |
| 4   | `permission denied for table order`                                      | Prisma sélectionne aussi `id`                                         | `GRANT SELECT (id, …)`                                         |
| 5   | `ERR_PACKAGE_PATH_NOT_EXPORTED`                                          | `require('varlock/package.json')`                                     | lecture directe du fichier                                     |
| 6   | variables vides au build                                                 | `NEXT_PUBLIC_*` non définies                                          | variables d'environnement GitHub                               |
| 7   | `EACCES /app/env.d.ts` au démarrage                                      | `varlock load` régénère les types, `/app` appartient à root           | retirer `@generateTypes` du schéma de l'image                  |
| 8   | le conteneur n'atteint pas le Postgres de l'hôte (`Host is unreachable`) | réseau rootless par défaut (`gvisor-tap-vsock`, loopback hôte bloqué) | `slirp4netns` + `10.0.2.2`                                     |
| 9   | `docker.sock` de root                                                    | `su deploy` garde `XDG_RUNTIME_DIR=/run/user/0`                       | toujours le calculer ; `deploy.sh` le force                    |
| 10  | `staging.…` répond comme la prod                                         | vhost non activé dans `sites-enabled`                                 | lien symbolique ; test par `robots.txt`                        |
| 11  | règles `reject` sans effet                                               | placées après la règle générale                                       | les mettre avant                                               |
| 12  | numéros « anonymisés » faux                                              | préfixe `+22507` = vrai préfixe d'opérateur                           | `+22500`                                                       |
| 13  | garde-fou « démarrage refusé »                                           | le processus reste vivant (500 partout)                               | accepté : `/api/health` échoue, `deploy.sh` refuse et restaure |

## 8. Exploitation courante

- **Déployer** : pousser sur `staging` (fusionner la branche à tester dedans). **Rollback** : workflow manuel `rollback`, ou `bash deploy.sh rollback staging`.
- **Suivre un déploiement** : liste des jobs (API Actions) ; pour une erreur, télécharger le journal du job et chercher `ERROR`. Une branche sans PR ne réveille pas la session : programmer un contrôle différé.
- **Promouvoir un compte** : `UPDATE "user" SET role='ADMIN' …` sur `-d eba_staging`. `ADMIN_EMAIL` ne promeut qu'à la **création** du compte.
- **Vérifier qu'on est bien sur le staging** : `curl https://staging…/robots.txt` doit afficher `Disallow: /`.

## 9. Transposition au monorepo (3 Next.js + NestJS) sur le même serveur

Tout ce qui suit est une recommandation ❓ : rien n'a été testé sur ce dépôt-là.

**Images.**

- Un Dockerfile multi-cibles à la racine du monorepo (contexte = racine), une cible par application. Pour pnpm : `pnpm --filter <app>... deploy` ou `turbo prune --docker` pour ne copier que ce qui est nécessaire.
- Next.js standalone en monorepo : fixer `outputFileTracingRoot` à la racine du dépôt ; le point d'entrée devient `apps/<app>/server.js`. Garder `output: 'standalone'` derrière une variable (comme `BUILD_STANDALONE`).
- NestJS : `node dist/main.js` (pas de standalone), dépendances de production seules, un point `/health`.
- `NEXT_PUBLIC_*` sont figées au build : **une image par front et par environnement**.

**Prérendu des fronts.** Si un front appelle l'API NestJS au build (SSG/ISR), c'est le même problème que ci-dessus, avec l'API à la place de la base. Choisir : (1) tunnel/URL vers l'API de staging pendant le build, (2) démarrer l'API et sa base dans la CI, (3) rendre ces pages dynamiques. Dans tous les cas, ajouter un `revalidate` aux pages statiques.

**Ordre de déploiement.** Schéma BDD (additif) → API NestJS → fronts. Un front ne doit jamais être mis en service avant l'API dont il dépend.

**Partager le serveur sans collision.**

- Ports : réserver une plage (ici 2001 = staging, 3001 = prod `pm2`). Lier chaque conteneur à `127.0.0.1`.
- Par application : nom de conteneur, port, fichier d'environnement, dossier d'état et verrou `flock` distincts (`deploy.sh` est paramétré par `ENV_NAME` : l'étendre à `APP_NAME`).
- `docker image prune -f` est global à l'utilisateur : sans danger pour les images utilisées, mais à garder en tête.
- Mémoire : additionner les `--memory` de tous les conteneurs plus Postgres et la prod, et comparer à `free -m`. Vérifier que la délégation cgroup v2 applique bien les limites ❓.
- Postgres partagé : `max_connections` est global ; plafonner le pool de chaque application (`DATABASE_POOL_MAX` ou équivalent TypeORM/Prisma), un rôle par application, des règles `pg_hba` explicites.
- nginx : un vhost par domaine, **activé** dans `sites-enabled`, flux temps réel sans tampon. Cloudflare est devant : vérifier le DNS et les en-têtes d'IP réelle.
- Même utilisateur `deploy` et même daemon rootless pour tous : bon pour la simplicité, mais un conteneur compromis voit les autres images. Séparer les utilisateurs si l'isolation compte.

## 10. Brief pour le prochain Claude

- **Langue et ton** : français, guidage pas à pas, commandes prêtes à copier (PowerShell côté PC, bash côté serveur), une commande par bloc.
- **Préférences exprimées** : au plus 2 lignes de commentaire, seulement si nécessaire ; pas de commentaires évidents.
- **Sécurité d'abord** : aucun secret dans les couches, les journaux ou les conversations ; moindre privilège ; ne jamais toucher à la base de prod sans confirmation explicite.
- **Méthode** : reproduire en local avant de pousser (un cycle de CI coûte 7 à 10 minutes) ; lire le journal du job plutôt que deviner ; vérifier ce qu'on affirme et le dire quand ce n'est pas vérifié ; demander avant les actions visibles à l'extérieur (déploiements, branches protégées, serveur).
- **Pas d'outil Docker local** dans l'environnement de travail de Claude : `docker build/run` ne se valide que sur GitHub et sur le serveur.
- Fichiers de référence à relire dans ce dépôt : `Dockerfile`, `deploy/deploy.sh`, `deploy/docker-entrypoint.sh`, `deploy/redact-build-url.mjs`, `deploy/anonymize-staging.sql`, `.github/workflows/cd-staging.yml`, `.github/workflows/test-db-tunnel.yml`, `docs/deploiement.md`.
