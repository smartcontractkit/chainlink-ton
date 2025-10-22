#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yaml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-docker-compose.env}"

usage() {
  cat <<'HELP'
Usage:
  ./env.sh up         # Run docker-compose up
  ./env.sh down       # Run docker-compose down
  ./env.sh destroy    # Stop, remove, and delete all containers, volumes, and networks
HELP
}

cmd_up() {
  echo "🚀 Starting all containers..."
  docker-compose -f ${COMPOSE_FILE} --env-file ${COMPOSE_ENV_FILE} up -d
  echo "✅ All containers are up."
  docker-compose -f ${COMPOSE_FILE} --env-file ${COMPOSE_ENV_FILE}  ps
}

cmd_down() {
  echo "⏹  Stopping containers (keeping volumes and network)..."
  docker-compose -f ${COMPOSE_FILE} --env-file ${COMPOSE_ENV_FILE} down --remove-orphans || true
  echo "✅ Containers stopped (volumes preserved)."
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  ""|-h|--help|help) usage ;;
  *) echo "Unknown command: ${1}"; usage; exit 1 ;;
esac
