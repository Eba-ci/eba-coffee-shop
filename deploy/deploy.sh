#!/usr/bin/env bash
# Usage : deploy.sh schema|deploy <env> <tag> | deploy.sh rollback <env>
# Un seul conteneur par environnement ; le schéma BDD n'est jamais défait au rollback.
set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$XDG_RUNTIME_DIR/docker.sock}"

ACTION="${1:-${EBA_ACTION:-deploy}}"
ENV_NAME="${2:-${EBA_ENV:-}}"
TAG="${3:-${EBA_TAG:-}}"
IMAGE="${EBA_IMAGE:-ghcr.io/kouakou-christ-axel/eba-coffee-shop}"
HOST_ADDR="${EBA_HOST_ADDR:-10.0.2.2}"

log() { printf '[deploy:%s] %s\n' "${ENV_NAME:-?}" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

case "$ENV_NAME" in
  staging)
    PORT=2001; NAME=eba-staging
    ENV_FILE="${EBA_ENV_FILE:-/var/www/eba-coffee/.env.staging}"
    STATE_DIR="${EBA_STATE_DIR:-$HOME/.local/state/eba/staging}"
    MEMORY=768m; CPUS=1.0
    ;;
  *) die "environnement « ${ENV_NAME} » non branché (seul « staging » l'est)" ;;
esac
CURRENT_FILE="$STATE_DIR/current"
PREVIOUS_FILE="$STATE_DIR/previous"
HEALTH_URL="http://127.0.0.1:$PORT/api/health"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "un autre déploiement est en cours"

[ -r "$ENV_FILE" ] || die "$ENV_FILE introuvable"
grep -q '^APP_ENV=staging$' "$ENV_FILE" || die "$ENV_FILE doit contenir APP_ENV=staging"
docker info >/dev/null 2>&1 || die "Docker injoignable (DOCKER_HOST=$DOCKER_HOST)"

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
    "$IMAGE:$1" >/dev/null
}

current="$(cat "$CURRENT_FILE" 2>/dev/null || true)"
previous="$(cat "$PREVIOUS_FILE" 2>/dev/null || true)"

if [ "$ACTION" = rollback ]; then
  [ -n "$previous" ] || die "aucun tag précédent enregistré"
  log "rollback : ${current:-?} -> $previous"
  docker image inspect "$IMAGE:$previous" >/dev/null 2>&1 || docker pull -q "$IMAGE:$previous" >/dev/null
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
  docker pull -q "$IMAGE-tools:$TAG" >/dev/null
  docker logout ghcr.io >/dev/null 2>&1 || true
  log "schéma BDD"
  # Le relevé de départ du journal de stock suit db:push (la table doit exister) ;
  # idempotent : sans effet quand tout est déjà journalisé.
  for task in db:merge-duplicate-emails db:push db:trigger db:indexes db:backfill-stock-baseline; do
    docker run --rm --add-host="host.docker.internal:$HOST_ADDR" --env-file "$ENV_FILE" \
      "$IMAGE-tools:$TAG" pnpm "$task"
  done
  exit 0
fi

ghcr_login
log "pull $IMAGE:$TAG"
docker pull -q "$IMAGE:$TAG" >/dev/null
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
