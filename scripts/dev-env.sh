#!/usr/bin/env sh
set -eu

action="${1:-}"
case "$action" in
  up) docker compose -f infra/compose.yaml up -d --build ;;
  down) docker compose -f infra/compose.yaml down ;;
  health) node scripts/healthcheck.mjs ;;
  *) echo "Usage: $0 {up|down|health}" >&2; exit 2 ;;
esac
