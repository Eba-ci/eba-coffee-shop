#!/bin/sh
# Garde-fou de la bascule db push -> prisma migrate (cf. docs/migration-prisma-migrate.md).
#
# Une base déjà peuplée par l'ancien pipeline ne connaît pas la baseline :
# `migrate deploy` la rejouerait (CREATE TYPE sur type existant), l'enregistrerait
# « failed » et bloquerait tous les déploiements suivants (P3009).
# Ici : si la baseline n'est pas au journal (absente OU en échec) et que la base
# correspond EXACTEMENT au schéma, on la marque appliquée (aucun SQL exécuté).
# Idempotent : sans effet une fois la baseline au journal. Base vide : rien à faire.
set -eu

BASELINE="20261113060000_baseline"
PRISMA="pnpm exec prisma"

status="$($PRISMA migrate status 2>&1 || true)"
if ! printf '%s' "$status" | grep -q "$BASELINE"; then
  echo "[adopt-baseline] baseline déjà au journal, rien à faire"
  exit 0
fi

# Base vide : migrate deploy créera tout, pas d'adoption.
rc=0
$PRISMA migrate diff --from-config-datasource --to-empty --exit-code >/dev/null 2>&1 || rc=$?
if [ "$rc" = 0 ]; then
  echo "[adopt-baseline] base vide, migrate deploy appliquera la baseline"
  exit 0
fi

# Base peuplée : elle doit correspondre exactement au schéma.
rc=0
$PRISMA migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code || rc=$?
case "$rc" in
  0)
    echo "[adopt-baseline] base conforme au schéma : baseline marquée appliquée"
    $PRISMA migrate resolve --applied "$BASELINE"
    ;;
  2)
    echo "[adopt-baseline] ERREUR : la base diffère du schéma (diff ci-dessus). Adoption refusée." >&2
    echo "[adopt-baseline] Corriger l'écart, puis relancer (cf. docs/migration-prisma-migrate.md)." >&2
    exit 1
    ;;
  *)
    echo "[adopt-baseline] ERREUR : migrate diff a échoué (code $rc)" >&2
    exit 1
    ;;
esac
