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
docker compose -f "${COMPOSE_FILE}" -p ton up -d

# Wait for genesis node to be healthy
echo "Waiting for genesis node to initialize (this may take a few minutes)..."
while ! docker compose -f "${COMPOSE_FILE}" -p ton exec -T genesis /usr/local/bin/lite-client -a 127.0.0.1:40004 -b E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY= -t 3 -c "last" &>/dev/null; do
  echo -n "."
  sleep 5
done

echo -e "\nTON network is up and running!"
echo "Explorer: http://localhost:8080/last"
echo "TON HTTP API: http://localhost:8081"
echo "Faucet: http://localhost:88"
