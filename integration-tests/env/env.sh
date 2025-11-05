#!/usr/bin/env bash
set -euo pipefail

TON_COMPOSE_FILE="${TON_COMPOSE_FILE:-docker-compose-ton.yaml}"
TON_COMPOSE_ENV_FILE="${TON_COMPOSE_ENV_FILE:-docker-compose-ton.env}"

EVM_COMPOSE_FILE="${EVM_COMPOSE_FILE:-docker-compose-evm.yaml}"
EVM_COMPOSE_ENV_FILE="${EVM_COMPOSE_ENV_FILE:-docker-compose-evm.env}"

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
  docker-compose -f ${TON_COMPOSE_FILE} --env-file ${TON_COMPOSE_ENV_FILE} up -d
  echo "✅ TON containers are up."
  docker-compose -f ${EVM_COMPOSE_FILE} --env-file ${EVM_COMPOSE_ENV_FILE} up -d
  echo "✅ EVM containers are up."
}

cmd_down() {
  echo "⏹ Stopping containers..."
  docker-compose -f ${TON_COMPOSE_FILE} --env-file ${TON_COMPOSE_ENV_FILE} down --remove-orphans || true
  echo "✅ TON Containers down."
  docker-compose -f ${EVM_COMPOSE_FILE} --env-file ${EVM_COMPOSE_ENV_FILE} down --remove-orphans || true
  echo "✅ EVM Containers down."
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  ""|-h|--help|help) usage ;;
  *) echo "Unknown command: ${1}"; usage; exit 1 ;;
esac
