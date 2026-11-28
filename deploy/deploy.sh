#!/usr/bin/env bash
# Usage : deploy.sh schema|deploy <env> <tag>   (env : staging | production) | deploy.sh rollback <env>
#         deploy.sh redis   (Redis de la file WhatsApp, partagé par les deux environnements)
#         deploy.sh worker <env> [tag]   ((re)lance seul le worker WhatsApp ; tag en service par défaut)
# Un seul conteneur par environnement ; le schéma BDD n'est jamais défait au rollback.
set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$XDG_RUNTIME_DIR/docker.sock}"

ACTION="${1:-${EBA_ACTION:-deploy}}"
ENV_NAME="${2:-${EBA_ENV:-}}"
TAG="${3:-${EBA_TAG:-}}"
IMAGE="${EBA_IMAGE:-ghcr.io/eba-ci/eba-coffee-shop}"
HOST_ADDR="${EBA_HOST_ADDR:-10.0.2.2}"

log() { printf '[deploy:%s] %s\n' "${ENV_NAME:-?}" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

# Redis de la file WhatsApp : un conteneur partagé, joignable sur 127.0.0.1 seulement.
# Les environnements s'y séparent par le numéro de base (/0 staging, /1 production).
REDIS_NAME=eba-redis
REDIS_PORT="${EBA_REDIS_PORT:-6381}"
REDIS_IMAGE="${EBA_REDIS_IMAGE:-redis:8-alpine}"

ensure_redis() {
  docker info >/dev/null 2>&1 || die "Docker injoignable (DOCKER_HOST=$DOCKER_HOST)"
  local running
  running="$(docker inspect -f '{{.State.Running}}' "$REDIS_NAME" 2>/dev/null || true)"
  if [ "$running" = true ]; then
    log "redis déjà lancé sur 127.0.0.1:$REDIS_PORT"
    return 0
  fi
  if [ "$running" = false ]; then
    log "redis arrêté : redémarrage"
    docker start "$REDIS_NAME" >/dev/null
  else
    log "démarrage de redis ($REDIS_IMAGE) sur 127.0.0.1:$REDIS_PORT"
    docker image inspect "$REDIS_IMAGE" >/dev/null 2>&1 || docker pull "$REDIS_IMAGE" >/dev/null
    # AOF : la file survit à un redémarrage. noeviction : jamais de travail jeté en silence.
    docker run -d --name "$REDIS_NAME" --restart unless-stopped \
      --memory 192m --cpus 0.5 \
      --user redis --cap-drop ALL --security-opt no-new-privileges \
      -p "127.0.0.1:$REDIS_PORT:6379" \
      -v eba-redis-data:/data \
      "$REDIS_IMAGE" redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy noeviction >/dev/null
  fi
  for _ in $(seq 1 30); do
    [ "$(docker exec "$REDIS_NAME" redis-cli ping 2>/dev/null || true)" = PONG ] && { log "redis prêt"; return 0; }
    sleep 1
  done
  docker logs --tail 30 "$REDIS_NAME" >&2 || true
  die "redis ne répond pas"
}

if [ "$ACTION" = redis ]; then
  ENV_NAME=redis
  ensure_redis
  exit 0
fi

# Montages en lecture seule passés à `docker run` (uploads historiques en prod).
MOUNTS=()
case "$ENV_NAME" in
  staging)
    PORT=2001; NAME=eba-staging
    ENV_FILE="${EBA_ENV_FILE:-/var/www/eba-coffee/.env.staging}"
    STATE_DIR="${EBA_STATE_DIR:-$HOME/.local/state/eba/staging}"
    MEMORY=768m; CPUS=1.0
    ;;
  production)
    # Même port que l'ancien pm2 (ecosystem.config.cjs) : nginx ne change pas.
    PORT=3001; NAME=eba-production
    ENV_FILE="${EBA_ENV_FILE:-/var/www/eba-coffee/.env.production}"
    STATE_DIR="${EBA_STATE_DIR:-$HOME/.local/state/eba/production}"
    MEMORY=1024m; CPUS=1.5
    # Fichiers historiques servis par la route /uploads (lecture seule).
    UPLOADS_DIR="${EBA_UPLOADS_DIR:-/var/www/eba-coffee/public/uploads}"
    [ -d "$UPLOADS_DIR" ] || die "$UPLOADS_DIR introuvable (uploads historiques)"
    MOUNTS=(-v "$UPLOADS_DIR:/app/public/uploads:ro")
    ;;
  *) die "environnement « ${ENV_NAME} » inconnu (staging ou production)" ;;
esac
CURRENT_FILE="$STATE_DIR/current"
PREVIOUS_FILE="$STATE_DIR/previous"
HEALTH_URL="http://127.0.0.1:$PORT/api/health"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "un autre déploiement est en cours"

[ -r "$ENV_FILE" ] || die "$ENV_FILE introuvable"
if [ "$ENV_NAME" = staging ]; then
  grep -q '^APP_ENV=staging$' "$ENV_FILE" || die "$ENV_FILE doit contenir APP_ENV=staging"
else
  # Garde-fou inverse : jamais le mode staging (e-mails coupés, code 000000) ni une base staging en prod.
  ! grep -Eq '^APP_ENV=.+' "$ENV_FILE" || die "$ENV_FILE ne doit pas définir APP_ENV en production"
  ! grep -Eiq '^DATABASE_URL=.*staging' "$ENV_FILE" || die "$ENV_FILE pointe vers une base staging"
  grep -q '^DATABASE_URL=.' "$ENV_FILE" || die "DATABASE_URL absent de $ENV_FILE"
fi
docker info >/dev/null 2>&1 || die "Docker injoignable (DOCKER_HOST=$DOCKER_HOST)"

# `docker pull` depuis le VPS peut couper en pleine copie de couche (GHCR en
# IPv6, image -tools volumineuse). On retente : les couches déjà téléchargées
# sont conservées, donc chaque tentative reprend là où la précédente s'est
# arrêtée. Un vrai 401/404 échoue aussi vite, sans boucle inutile.
pull_image() {
  local ref="$1" attempt=1
  local max="${EBA_PULL_ATTEMPTS:-8}"
  # Déjà présent (rejeu d'un déploiement partiel) : rien à télécharger.
  docker image inspect "$ref" >/dev/null 2>&1 && return 0
  while [ "$attempt" -le "$max" ]; do
    if docker pull "$ref"; then return 0; fi
    log "pull de $ref échoué (tentative $attempt/$max)"
    if [ "$attempt" -lt "$max" ]; then
      sleep $((attempt * 5))
    fi
    attempt=$((attempt + 1))
  done
  log "ERREUR : impossible de récupérer $ref après $max tentatives" >&2
  return 1
}

wait_healthy() {
  for _ in $(seq 1 60); do
    curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    [ "$(docker inspect -f '{{.RestartCount}}' "$NAME" 2>/dev/null || echo 0)" -lt 2 ] || return 1
    sleep 2
  done
  return 1
}

run_container() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped \
    --memory "$MEMORY" --cpus "$CPUS" \
    --cap-drop ALL --security-opt no-new-privileges \
    --add-host="host.docker.internal:$HOST_ADDR" \
    --env-file "$ENV_FILE" \
    -p "127.0.0.1:$PORT:3000" \
    ${MOUNTS[@]+"${MOUNTS[@]}"} \
    "$IMAGE:$1" >/dev/null
}

ghcr_login() {
  [ -z "${GHCR_TOKEN:-}" ] || echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-eba-deploy}" --password-stdin >/dev/null
}

# Worker WhatsApp : image -tools (dépôt + tsx) au même tag que l'app, conteneur à part.
# Jamais bloquant : les appelants l'enveloppent dans `|| log`, et rien ici ne fait `die`.
WORKER_NAME="eba-worker-$ENV_NAME"
WORKER_MEMORY="${EBA_WORKER_MEMORY:-384m}"
WORKER_CPUS="${EBA_WORKER_CPUS:-0.5}"

worker_wanted() { grep -Eq '^REDIS_URL=[^[:space:]]' "$ENV_FILE"; }

worker_image() {
  local ref="$IMAGE-tools:$1" rc=0
  docker image inspect "$ref" >/dev/null 2>&1 && return 0
  ghcr_login || log "connexion GHCR impossible pour $ref"
  EBA_PULL_ATTEMPTS="${EBA_WORKER_PULL_ATTEMPTS:-3}" pull_image "$ref" || rc=1
  docker logout ghcr.io >/dev/null 2>&1 || true
  return "$rc"
}

start_worker() {
  local tag="$1"
  if ! worker_wanted; then
    docker rm -f "$WORKER_NAME" >/dev/null 2>&1 || true
    log "REDIS_URL absent de $ENV_FILE : pas de worker WhatsApp"
    return 0
  fi
  worker_image "$tag" || { log "image -tools $tag indisponible"; return 1; }
  docker rm -f "$WORKER_NAME" >/dev/null 2>&1 || true
  # Binaire tsx appelé directement (comme le script `whatsapp:worker`) : `pnpm` en PID 1
  # ne relaie pas SIGTERM, et le worker ne se fermerait pas proprement.
  docker run -d --name "$WORKER_NAME" --restart unless-stopped \
    --memory "$WORKER_MEMORY" --cpus "$WORKER_CPUS" \
    --cap-drop ALL --security-opt no-new-privileges \
    --log-opt max-size=10m --log-opt max-file=3 \
    --add-host="host.docker.internal:$HOST_ADDR" \
    --env-file "$ENV_FILE" \
    "$IMAGE-tools:$tag" ./node_modules/.bin/tsx --env-file=.env scripts/whatsapp-worker.ts >/dev/null \
    || { log "docker run du worker a échoué"; return 1; }
  sleep "${EBA_WORKER_SETTLE:-5}"
  if [ "$(docker inspect -f '{{.State.Running}} {{.State.Restarting}} {{.RestartCount}}' "$WORKER_NAME" 2>/dev/null || true)" != "true false 0" ]; then
    docker logs --tail 30 "$WORKER_NAME" >&2 || true
    return 1
  fi
  log "worker WhatsApp en service ($WORKER_NAME, $tag)"
}

current="$(cat "$CURRENT_FILE" 2>/dev/null || true)"
previous="$(cat "$PREVIOUS_FILE" 2>/dev/null || true)"

if [ "$ACTION" = rollback ]; then
  [ -n "$previous" ] || die "aucun tag précédent enregistré"
  log "rollback : ${current:-?} -> $previous"
  docker image inspect "$IMAGE:$previous" >/dev/null 2>&1 || pull_image "$IMAGE:$previous" || die "image $previous indisponible"
  run_container "$previous"
  wait_healthy || { docker logs --tail 60 "$NAME" >&2 || true; die "$previous ne répond pas sur /api/health"; }
  echo "$previous" >"$CURRENT_FILE"
  echo "$current" >"$PREVIOUS_FILE"
  start_worker "$previous" || log "AVERTISSEMENT : worker WhatsApp non relancé sur $previous (journaux : docker logs $WORKER_NAME)"
  exit 0
fi

if [ "$ACTION" = worker ]; then
  worker_tag="${TAG:-$current}"
  [ -n "$worker_tag" ] || die "tag d'image manquant (aucun tag en service enregistré)"
  start_worker "$worker_tag" || die "worker WhatsApp non démarré (journaux : docker logs $WORKER_NAME)"
  exit 0
fi

case "$ACTION" in schema|deploy) ;; *) die "action inconnue « $ACTION »" ;; esac
[ -n "$TAG" ] || die "tag d'image manquant"

if [ "$ACTION" = schema ]; then
  ghcr_login
  pull_image "$IMAGE-tools:$TAG" || die "image -tools $TAG indisponible"
  docker logout ghcr.io >/dev/null 2>&1 || true
  log "schéma BDD"
  # Le relevé de départ du journal de stock suit db:migrate (la table doit exister) ;
  # idempotent : sans effet quand tout est déjà journalisé.
  # En production, le relevé de départ reste un geste volontaire (bouton ou pnpm à la main).
  # Schéma : prisma migrate deploy (journal _prisma_migrations ; les migrations
  # historiques sont consolidées dans 20261113060000_baseline, marquée appliquée
  # une fois par environnement — automatisé par db:adopt-baseline, cf.
  # docs/migration-prisma-migrate.md).
  tasks="db:merge-duplicate-emails db:adopt-baseline db:migrate db:trigger db:indexes"
  [ "$ENV_NAME" != staging ] || tasks="$tasks db:backfill-stock-baseline"
  for task in $tasks; do
    docker run --rm --add-host="host.docker.internal:$HOST_ADDR" --env-file "$ENV_FILE" \
      "$IMAGE-tools:$TAG" pnpm "$task"
  done
  exit 0
fi

ghcr_login
log "pull $IMAGE:$TAG"
pull_image "$IMAGE:$TAG" || die "image $TAG indisponible"
docker logout ghcr.io >/dev/null 2>&1 || true

log "remplacement du conteneur par $TAG"
run_container "$TAG"
if ! wait_healthy; then
  docker logs --tail 60 "$NAME" >&2 || true
  if [ -n "$current" ]; then
    log "$TAG n'est pas sain : retour à $current"
    run_container "$current"
    wait_healthy || die "$TAG n'est pas sain et $current ne redémarre pas non plus"
    die "$TAG n'est pas sain, $current a été relancé"
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  die "$TAG n'est pas sain (aucun tag précédent à relancer)"
fi

[ -z "$current" ] || echo "$current" >"$PREVIOUS_FILE"
echo "$TAG" >"$CURRENT_FILE"
docker image prune -f >/dev/null
start_worker "$TAG" || log "AVERTISSEMENT : worker WhatsApp non démarré sur $TAG, l'application n'est pas touchée (journaux : docker logs $WORKER_NAME)"
log "terminé : $TAG en service"
