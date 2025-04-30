#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yaml"

echo "Starting TON local network using ${COMPOSE_FILE}"

# Debug: Show if we have any bind mount environment variables set
if [ -n "$VOLUME_DRIVER" ] || [ -n "$SHARED_DATA_O_OPT" ]; then
  echo "Volume bind mount environment variables detected:"
  env | grep -E 'VOLUME_DRIVER|_O_OPT|_TYPE_OPT|_DEVICE_OPT' || echo "None found"
fi

# Skip docker-compose pull if we're in GitHub Actions (images already loaded)
if [ -z "$GITHUB_ACTIONS" ]; then
  echo "Running locally, pulling Docker images..."
  docker compose -f "${COMPOSE_FILE}" pull
else
  echo "Running in GitHub Actions with pre-loaded images, skipping pull..."
fi

echo "Starting essential TON services..."
# Add project name to avoid prefix issues with volume names
docker compose -f "${COMPOSE_FILE}" -p mylocalton up -d

# Wait for genesis node to be healthy
# Add a timeout for health check
MAX_WAIT_TIME=300 # 5 minutes
start_time=$(date +%s)

while ! docker compose -f "${COMPOSE_FILE}" -p mylocalton exec -T genesis /usr/local/bin/lite-client -a 127.0.0.1:40004 -b E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY= -t 3 -c "last" &>/dev/null; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -gt $MAX_WAIT_TIME ]; then
    echo -e "\nTimed out waiting for genesis node to initialize!"
    docker compose -f "${COMPOSE_FILE}" -p mylocalton logs genesis
    exit 1
  fi

  echo -n "."
  sleep 5
done

echo -e "\nTON network is up and running!"
echo "Explorer: http://localhost:8080/last"
echo "TON HTTP API: http://localhost:8081"
echo "Faucet: http://localhost:88"
