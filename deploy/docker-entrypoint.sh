#!/bin/sh
# `next build` fige les valeurs varlock du build : on recalcule __VARLOCK_ENV avec
# les vraies variables du conteneur (il a priorité). Config invalide = démarrage refusé.
set -eu

if ! resolved="$(varlock load --format json-full --compact)"; then
  echo "[entrypoint] configuration invalide, démarrage refusé :" >&2
  varlock load >&2 || true
  exit 1
fi

__VARLOCK_ENV="$resolved"
export __VARLOCK_ENV
exec node server.js
