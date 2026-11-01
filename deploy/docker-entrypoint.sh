#!/bin/sh
# Entrée du conteneur : résout la configuration à l'exécution, puis lance Next.
#
# Le build fige dans `.next/server/chunks/[turbopack]_runtime.js` les valeurs
# varlock vues au build (factices en CI). Un `__VARLOCK_ENV` déjà présent dans
# l'environnement a priorité (plugin @varlock/nextjs-integration) : on le calcule
# donc ici avec les vraies variables du conteneur (--env-file). Une configuration
# invalide fait échouer le démarrage : la bascule n'a alors pas lieu.
set -eu

if ! resolved="$(varlock load --format json-full --compact)"; then
  echo "[entrypoint] configuration invalide, démarrage refusé :" >&2
  varlock load >&2 || true
  exit 1
fi

__VARLOCK_ENV="$resolved"
export __VARLOCK_ENV
exec node server.js
