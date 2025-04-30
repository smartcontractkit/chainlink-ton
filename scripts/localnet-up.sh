#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yaml"

echo "Starting TON local network using ${COMPOSE_FILE}"

echo "Pulling required Docker images..."
docker-compose -f "${COMPOSE_FILE}" pull

echo "Starting essential TON services..."
docker-compose -f "${COMPOSE_FILE}" up -d

# wait for genesis node to be healthy
echo "Waiting for genesis node to initialize (this may take a few minutes)..."
while ! docker-compose -f "${COMPOSE_FILE}" exec -T genesis /usr/local/bin/lite-client -a 127.0.0.1:40004 -b E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY= -t 3 -c "last" &>/dev/null; do
  echo -n "."
  sleep 5
done

echo -e "\nTON network is up and running!"
echo "Explorer: http://localhost:8080/last"
echo "TON HTTP API: http://localhost:8081"
echo "Faucet: http://localhost:88"
