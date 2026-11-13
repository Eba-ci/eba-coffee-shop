#!/usr/bin/env bash
# Usage : deploy.sh schema|deploy <env> <tag>   (env : staging | production) | deploy.sh rollback <env>
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
  exit 0
fi

case "$ACTION" in schema|deploy) ;; *) die "action inconnue « $ACTION »" ;; esac
[ -n "$TAG" ] || die "tag d'image manquant"

ghcr_login() {
  [ -z "${GHCR_TOKEN:-}" ] || echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-eba-deploy}" --password-stdin >/dev/null
}

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
  # une fois par environnement — cf. docs/migration-prisma-migrate.md).
  tasks="db:merge-duplicate-emails db:migrate db:trigger db:indexes"
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
log "terminé : $TAG en service"
