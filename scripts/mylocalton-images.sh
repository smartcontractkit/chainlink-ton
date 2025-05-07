#!/usr/bin/env bash
set -euo pipefail

CACHE_DIR="${1:-integration-tests/.cache/images}"
COMPOSE_URL="https://raw.githubusercontent.com/neodix42/mylocalton-docker/main/docker-compose.yaml"
COMPOSE_FILE="$CACHE_DIR/docker-compose.yml"
TAR_FILE="$CACHE_DIR/mylocalton.tar"

CORE_IMAGES=(
  ghcr.io/neodix42/mylocalton-docker:latest
  ghcr.io/neodix42/ton-http-api:latest
  redis:latest
  postgres:17
  toncenter/ton-indexer-worker:v1.2.0-test
  toncenter/ton-indexer-api:v1.2.0-test
)

mkdir -p "$CACHE_DIR"

curl -fsSL "$COMPOSE_URL" -o "$COMPOSE_FILE"

if [[ -f "$TAR_FILE" ]]; then
  echo "→ loading images from cache"
  docker load -i "$TAR_FILE"
  exit 0
fi

echo "→ cache miss: pulling core images…"
for img in "${CORE_IMAGES[@]}"; do
  docker pull "$img"
done

echo "→ saving tar for next time: ${CORE_IMAGES[*]}"
docker save "${CORE_IMAGES[@]}" -o "$TAR_FILE"
