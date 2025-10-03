#!/usr/bin/env bash

set -e

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
EXPLORER_BIN="$SCRIPT_DIR/ton-explorer"

# Stop explorer
if [[ "$1" == "stop" || "$1" == "--stop" ]]; then
    docker rm -f ton-explorer 2>/dev/null || true
    echo "OK: Explorer stopped"
    exit 0
fi

# Find running mylocalton container (exclude explorer)
CONTAINER_ID=$(docker ps --format "{{.ID}}\t{{.Image}}" | grep "mylocalton-docker" | grep -v "mylocalton-docker-explorer" | awk '{print $1}' | head -1 || true)

if [[ -z "$CONTAINER_ID" ]]; then
    echo "ERROR: No running mylocalton container found"
    echo ""
    echo "Possible issues:"
    echo "  1. The mylocalton container is not running yet (tests starting?)"
    echo "  2. The container has been stopped or removed"
    echo ""
    echo "To check all mylocalton containers (including stopped):"
    echo "  docker ps -a | grep mylocalton"
    exit 1
fi

echo "OK: Found running mylocalton container: $CONTAINER_ID"

# Build the explorer if not already built
if [[ ! -f "$EXPLORER_BIN" ]]; then
    echo "Building explorer..."
    (cd "$SCRIPT_DIR" && go build -o ton-explorer main.go)
fi

"$EXPLORER_BIN" --container "$CONTAINER_ID"
