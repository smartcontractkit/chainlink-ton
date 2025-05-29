#!/usr/bin/env bash

# This script sets up the end-to-end (e2e) testing environment for Chainlink CCIP.
# It performs the following main actions:
#   1. Defines and validates paths for the Chainlink TON and Chainlink Core repositories.
#   2. Verifies that the Chainlink Core repository is at the blessed commit specified in .core_version.
#   3. Tears down any existing PostgreSQL test database container.
#   4. Starts a new PostgreSQL container for testing.
#   5. Prepares the Chainlink Core repository by:
#      - Replacing the chainlink-ton dependency with the local version.
#      - Tidying Go modules.
#      - Downloading Go module dependencies.
#      - Building the 'ccip.test' binary.
#      - Preparing the test database schema using 'ccip.test local db preparetest'.
#
# Usage: ./scripts/e2e/setup-env.sh [-c|--core-dir <core_dir>]
#
# Arguments:
#   -c, --core-dir <core_dir>: Optional. Path to the Chainlink Core directory.
#                              Defaults to ../chainlink relative to the script's root directory.
#
# Environment Variables:
#   Implicitly uses CL_DATABASE_URL after setting it up.
#
# Notes:
#   - This script modifies the go.mod file of the specified Chainlink Core directory
#     to use the local Chainlink TON project.
#   - Ensure that the blessed commit in .core_version matches with the Core repository git ref.

set -euo pipefail

# configuration & global variables
ROOT_DIR=$(git rev-parse --show-toplevel)
DEFAULT_CHAINLINK_CORE_DIR="${ROOT_DIR}/../chainlink"
CORE_VERSION_FILE_PATH="${ROOT_DIR}/scripts/.core_version"

# test database configuration
PG_CONTAINER_NAME="cl_pg"
PG_HOST="localhost"
PG_PORT=5432
PG_DB="chainlink_test"
PG_USER="postgres"
PG_PASSWORD="postgres"

# configurable arguments
ARG_CORE_DIR=""

log_info() {
  echo "INFO: $1"
}

log_error() {
  echo "ERROR: $1" >&2
}

print_usage_setup() {
  echo "Usage: $0 [-c|--core-dir <core_dir>]" >&2
}

validate_project_dir() {
  local dir_path="$1"
  local project_name="$2"
  if [ ! -d "$dir_path" ]; then
    log_error "$project_name directory '$dir_path' not found or not a directory."
    exit 1
  fi
  if [ ! -f "$dir_path/go.mod" ]; then
    log_error "Missing go.mod in $project_name directory: '$dir_path/go.mod'."
    exit 1
  fi
}

# argument parsing and validation
while [[ $# -gt 0 ]]; do
  case "$1" in
  -c | --core-dir)
    ARG_CORE_DIR="$2"
    shift 2
    ;;
  *)
    log_error "Unknown option: $1"
    print_usage_setup
    exit 1
    ;;
  esac
done

CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

log_info "=== CHAINLINK TON CCIP - E2E Test Environment Setup ==="
log_info "Using Chainlink TON: $ROOT_DIR"
log_info "Using Chainlink Core: $CHAINLINK_CORE_DIR"

validate_project_dir "$ROOT_DIR" "Chainlink TON"
validate_project_dir "$CHAINLINK_CORE_DIR" "Chainlink Core"

log_info "Verifying Chainlink Core version..."

# check core version file
if [ ! -f "$CORE_VERSION_FILE_PATH" ]; then
  log_error "Core version file not found: $CORE_VERSION_FILE_PATH"
  exit 1
fi

# checked out core ref validation
BLESSED_CORE_REF=$(tr -d '[:space:]' <"$CORE_VERSION_FILE_PATH")
if [ -z "$BLESSED_CORE_REF" ]; then
  log_error "Core version file is empty: $CORE_VERSION_FILE_PATH"
  exit 1
fi
log_info "Expected Chainlink Core ref (from .core_version): $BLESSED_CORE_REF"

if ! (cd "$CHAINLINK_CORE_DIR" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
  log_error "Chainlink Core directory '$CHAINLINK_CORE_DIR' is not a git repository."
  exit 1
fi

CURRENT_CORE_COMMIT=$(cd "$CHAINLINK_CORE_DIR" && git rev-parse HEAD 2>/dev/null)
if [ -z "$CURRENT_CORE_COMMIT" ]; then
  log_error "Could not determine current commit in '$CHAINLINK_CORE_DIR'. Check if it's a valid git repo with commits."
  exit 1
fi

BLESSED_CORE_REF_COMMIT=$(cd "$CHAINLINK_CORE_DIR" && git rev-parse --verify "$BLESSED_CORE_REF^{commit}" 2>/dev/null)
if [ -z "$BLESSED_CORE_REF_COMMIT" ]; then
  log_error "Failed to resolve blessed Chainlink Core ref '$BLESSED_CORE_REF' to a commit in '$CHAINLINK_CORE_DIR'."
  log_error "Ensure the ref exists and is fetched (e.g., run 'git fetch --all' in '$CHAINLINK_CORE_DIR')."
  exit 1
fi

if [ "$CURRENT_CORE_COMMIT" != "$BLESSED_CORE_REF_COMMIT" ]; then
  log_error "Chainlink Core version mismatch!"
  log_error "  Current commit in '$CHAINLINK_CORE_DIR': $CURRENT_CORE_COMMIT"
  log_error "  Expected commit for ref '$BLESSED_CORE_REF': $BLESSED_CORE_REF_COMMIT (resolved from $CORE_VERSION_FILE_PATH)"
  log_error "Please checkout the correct commit/branch in '$CHAINLINK_CORE_DIR'."
  exit 1
else
  log_info "Chainlink Core version matches. Current commit: $CURRENT_CORE_COMMIT"
fi

# test database setup
log_info "Tearing down any existing '$PG_CONTAINER_NAME'..."
docker rm -f "$PG_CONTAINER_NAME" &>/dev/null || true

log_info "Starting Postgres container '$PG_CONTAINER_NAME'..."
docker run -d --name "$PG_CONTAINER_NAME" -p "$PG_PORT:$PG_PORT" \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DB" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:14-alpine \
  postgres \
  -c max_connections=1000 \
  -c shared_buffers=2GB \
  -c log_lock_waits=true

log_info "Waiting for Postgres to accept connections on $PG_HOST:$PG_PORT..."

SECONDS=0
while ! pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" &>/dev/null; do
  if ((SECONDS > 30)); then
    log_error "Postgres did not become ready within 30s."
    log_error "Container logs:"
    docker logs "$PG_CONTAINER_NAME" || true
    exit 1
  fi
  sleep 1
done

CL_DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}?sslmode=disable"
log_info "Test Database URL: $CL_DATABASE_URL "
export CL_DATABASE_URL # this is needed for the ccip.test binary to connect to the database

# Core Setup
log_info "Preparing Chainlink Core (dependencies, build, DB setup)..."
(
  cd "$CHAINLINK_CORE_DIR"
  log_info "Active Go version: $(go version)"

  go mod edit -replace="github.com/smartcontractkit/chainlink-ton=$ROOT_DIR"
  go run github.com/jmank88/gomods@v0.1.5 tidy

  go mod download
  if [ -f "./integration-tests/go.mod" ]; then
    (cd "./integration-tests" && go mod download)
  fi
  go build -o ccip.test .

  ./ccip.test local db preparetest
)

log_info "=================================="
log_info "Environment setup complete."
log_info "Chainlink Core Directory used: $CHAINLINK_CORE_DIR"
log_info "Root Directory used: $ROOT_DIR"
log_info "Please ensure CL_DATABASE_URL is exported in your environment before running tests."
log_info "export CL_DATABASE_URL=${CL_DATABASE_URL}"
log_info "=================================="
log_info "IMPORTANT: Please note this setup adds the following replace directive to chainlink core:"
log_info "  replace github.com/smartcontractkit/chainlink-ton => ${ROOT_DIR}"
log_info "This will use your local chainlink-ton code in the core repo."
log_info "=================================="
