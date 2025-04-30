#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yaml"

echo "Stopping TON local network..."

# shut down all services, reset the network
docker-compose -f "${COMPOSE_FILE}" down -v --rmi all

echo "TON local network stopped."
