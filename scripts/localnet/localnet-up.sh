#!/bin/bash
set -e

if [ -z "$GITHUB_ACTIONS" ]; then
  ENVIRONMENT="local"
else
  ENVIRONMENT="ci"
fi

PROJECT_NAME="ton-localnet"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yaml"
MAX_WAIT_TIME=120 # 2 minutes
ESSENTIAL_SERVICES="genesis tonhttpapi event-cache index-postgres index-worker index-api"

echo -e "==============================================
Starting TON local network using ${COMPOSE_FILE},
current environment: ${ENVIRONMENT},
project name: ${PROJECT_NAME},
max wait time: ${MAX_WAIT_TIME} seconds
==============================================\n"

# Skip docker-compose pull if we're in GitHub Actions (images already loaded)
# In local development, we want to pull all the images including faucet, explorer, etc...
if [ "$ENVIRONMENT" = "local" ]; then
  echo "Running locally, pulling Docker images..."
  echo "Please ignore any warnings about missing env variables, they're cached volume bindings on CI"
  docker compose -f "${COMPOSE_FILE}" pull
  echo "Starting all TON services..."
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d --pull never
else
  echo "Running in GitHub Actions with pre-loaded images, skipping pull..."
  echo "CI environment detected, starting only essential services..."
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d --pull never ${ESSENTIAL_SERVICES}
fi

# Wait for genesis node to be healthy with timeout
start_time=$(date +%s)
while ! docker compose -f "${COMPOSE_FILE}" -p ton-localnet exec -T genesis /usr/local/bin/lite-client -a 127.0.0.1:40004 -b E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY= -t 3 -c "last" &>/dev/null; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -gt $MAX_WAIT_TIME ]; then
    echo -e "\nTimed out waiting for genesis node to initialize!"
    docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" logs genesis
    exit 1
  fi

  echo -n "."
  sleep 5
done

echo -e "=============================================="
echo -e "\nTON network is up and running!"
if [ "$ENVIRONMENT" = "local" ]; then
  echo "- TON HTTP API: http://localhost:8081"
  echo "- Explorer: http://localhost:8080/last"
  echo "- Faucet: http://localhost:88"
fi
echo -e "=============================================="
