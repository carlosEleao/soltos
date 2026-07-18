#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[civiclink] applying prisma migrations…"
  if [[ -f node_modules/prisma/build/index.js ]]; then
    node node_modules/prisma/build/index.js migrate deploy
  else
    npx prisma migrate deploy
  fi
fi

exec "$@"
