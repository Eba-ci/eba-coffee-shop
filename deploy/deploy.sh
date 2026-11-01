#!/usr/bin/env bash
# Déploiement Docker d'un environnement (staging pour l'instant) : UN SEUL conteneur.
#
#   deploy.sh deploy   <env> <tag>   # pull, schéma BDD, remplace le conteneur, réchauffe
#   deploy.sh rollback <env>         # relance le tag précédent (le schéma BDD n'est pas défait)
#
# Lancé par la CI (appleboy/ssh-action, script_path) : arguments ou variables
# EBA_ACTION / EBA_ENV / EBA_TAG. À la main : `bash deploy.sh rollback staging`.
# Le remplacement du conteneur coupe le site quelques secondes (comparable à
# `pm2 startOrReload`). Prérequis serveur : docs/deploiement.md.
set -euo pipefail

ACTION="${1:-${EBA_ACTION:-deploy}}"
ENV_NAME="${2:-${EBA_ENV:-}}"
TAG="${3:-${EBA_TAG:-}}"
IMAGE="${EBA_IMAGE:-ghcr.io/kouakou-christ-axel/eba-coffee-shop}"

log() { printf '[deploy:%s] %s\n' "${ENV_NAME:-?}" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

case "$ENV_NAME" in
  staging)
    PORT=2001; NAME=eba-staging
    ENV_FILE="${EBA_ENV_FILE:-/etc/eba/staging.env}"
    STATE_DIR="${EBA_STATE_DIR:-/var/lib/eba/staging}"
    MEMORY=768m; CPUS=1.0
    ;;
  *) die "environnement « ${ENV_NAME} » non branché (seul « staging » l'est pour l'instant)" ;;
esac
CURRENT_FILE="$STATE_DIR/current"
PREVIOUS_FILE="$STATE_DIR/previous"
HEALTH_URL="http://127.0.0.1:$PORT/api/health"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "un autre déploiement est en cours"

[ -r "$ENV_FILE" ] || die "$ENV_FILE introuvable"
# Garde-fou : un staging ne doit jamais tourner avec la config d'un autre environnement.
grep -q '^APP_ENV=staging$' "$ENV_FILE" || die "$ENV_FILE doit contenir APP_ENV=staging"
env_value() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }
# Le réchauffage est obligatoire (HTML du build = base vide) : on le vérifie AVANT de toucher quoi que ce soit.
SECRET="$(env_value CRON_SECRET)"
[ -n "$SECRET" ] || die "CRON_SECRET absent de $ENV_FILE : les pages afficheraient les valeurs du build (base vide)"

wait_healthy() {
  for _ in $(seq 1 60); do
    curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

run_container() { # <tag>
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped \
    --memory "$MEMORY" --cpus "$CPUS" \
    --cap-drop ALL --security-opt no-new-privileges \
    --add-host=host.docker.internal:host-gateway \
    --env-file "$ENV_FILE" \
    -p "127.0.0.1:$PORT:3000" \
    "$IMAGE:$1" >/dev/null
}

# Le HTML prérendu au build vient d'une base vide (valeurs par défaut des réglages). La
# route invalide tout l'arbre et renvoie la liste réelle des pages prérendues ; on les
# requête une fois pour les régénérer avec la vraie base. Entre le démarrage du conteneur
# et la fin de cette étape (quelques secondes), les pages affichent encore les valeurs du build.
warm_up() {
  local warm paths count=0 p
  warm="$(curl -fsS -X POST -H "Authorization: Bearer $SECRET" \
    "http://127.0.0.1:$PORT/api/internal/revalidate")" || die "réchauffage refusé (CRON_SECRET du conteneur différent ?)"
  paths="$(printf '%s' "$warm" | sed -e 's/.*"paths":\[//' -e 's/\].*//' | tr -d '"' | tr ',' '\n')"
  [ -n "$paths" ] || die "le réchauffage n'a renvoyé aucune page (manifeste de prérendu introuvable ?)"
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    curl -fsS --max-time 30 -o /dev/null "http://127.0.0.1:$PORT$p" || log "avertissement : $p n'a pas répondu"
    count=$((count + 1))
  done <<<"$paths"
  log "réchauffage : $count pages régénérées"
}

current="$(cat "$CURRENT_FILE" 2>/dev/null || true)"
previous="$(cat "$PREVIOUS_FILE" 2>/dev/null || true)"

if [ "$ACTION" = rollback ]; then
  [ -n "$previous" ] || die "aucun tag précédent enregistré, rollback impossible"
  log "rollback : ${current:-?} -> $previous (rappel : le schéma BDD n'est pas défait)"
  docker image inspect "$IMAGE:$previous" >/dev/null 2>&1 || docker pull -q "$IMAGE:$previous" >/dev/null
  run_container "$previous"
  wait_healthy || { docker logs --tail 60 "$NAME" >&2 || true; die "$previous ne répond pas sur /api/health"; }
  warm_up
  echo "$previous" >"$CURRENT_FILE"
  echo "$current" >"$PREVIOUS_FILE"
  exit 0
fi

[ "$ACTION" = deploy ] || die "action inconnue « $ACTION »"
[ -n "$TAG" ] || die "tag d'image manquant"

if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-eba-deploy}" --password-stdin >/dev/null
fi
log "pull $IMAGE:$TAG"
docker pull -q "$IMAGE:$TAG" >/dev/null
docker pull -q "$IMAGE-tools:$TAG" >/dev/null

# Schéma BDD : AVANT de remplacer le conteneur, pendant que l'ancien sert encore
# (changements additifs uniquement, cf. docs/deploiement.md). Même ordre que l'ancien cd.yml.
run_tool() {
  docker run --rm --add-host=host.docker.internal:host-gateway --env-file "$ENV_FILE" \
    "$IMAGE-tools:$TAG" pnpm "$@"
}
log "schéma BDD"
run_tool db:merge-duplicate-emails
run_tool db:push
run_tool db:trigger
run_tool db:indexes

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
  die "$TAG n'est pas sain (aucun tag précédent à relancer)"
fi

warm_up
[ -z "$current" ] || echo "$current" >"$PREVIOUS_FILE"
echo "$TAG" >"$CURRENT_FILE"

site="$(env_value NEXT_PUBLIC_SITE_URL)"
if [ -n "$site" ] && ! curl -fsS --max-time 10 "${site%/}/api/health" >/dev/null; then
  log "avertissement : la sonde publique ${site%/}/api/health échoue (DNS, TLS ou nginx)"
fi
docker image prune -f >/dev/null
log "terminé : $TAG en service"
