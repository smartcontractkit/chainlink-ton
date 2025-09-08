#!/usr/bin/env bash

# This script sets up the end-to-end (e2e) testing environment for Chainlink CCIP.
# It performs the following main actions:
#   1. Defines and validates paths for the Chainlink TON and Chainlink Core repositories.
#   2. Verifies that the Chainlink Core repository is at the blessed commit specified in .core_version.
#   3. Tears down any existing PostgreSQL test database container.
#   4. Starts a new PostgreSQL container for testing.
#   5. Prepares the Chainlink Core repository by:
#      - Updating the TON plugin gitRef in plugins.public.yaml with current commit.
#      - Replacing all chainlink-ton module dependencies with local versions.
#      - Tidying Go modules.
#      - Preparing the test database schema using 'preparetest' cmd.
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
#   - This script modifies go.mod files in the Chainlink Core directory to use local
#     Chainlink TON project modules with relative paths.
#   - This script updates the TON plugin gitRef in plugins.public.yaml to use the current commit.
#   - Ensure that the blessed commit in .core_version matches with the Core repository git ref.

set -euo pipefail

# source shared library
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "${SCRIPT_DIR}/lib.sh"

# test database configuration
PG_CONTAINER_NAME="cl_pg"
PG_HOST="localhost"
PG_PORT=5432
PG_DB="chainlink_test"
PG_USER="postgres"
PG_PASSWORD="postgres"

# configurable arguments
ARG_CORE_DIR=""

print_usage_setup() {
  echo "Usage: $0 [-c|--core-dir <core_dir>]" >&2
}

# setup and start postgresql container for testing
setup_postgres() {
  log_info "Tearing down any existing '$PG_CONTAINER_NAME'..."
  docker rm -f "$PG_CONTAINER_NAME" &>/dev/null || true

  log_info "Starting Postgres container '$PG_CONTAINER_NAME'..."
  docker run -d --name "$PG_CONTAINER_NAME" -p "$PG_PORT:$PG_PORT" \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e POSTGRES_DB="$PG_DB" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    postgres:16-alpine \
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
  export CL_DATABASE_URL
}

# update ton plugin gitref in plugins.public.yaml
update_plugin_config() {
  PLUGINS_FILE="plugins/plugins.public.yaml"
  if [ -f "$PLUGINS_FILE" ]; then
    log_info "Updating TON plugin gitRef in plugins.public.yaml..."
    # Note: yq removes blank lines from YAML files due to underlying go-yaml parser behavior
    # This is a known limitation: https://github.com/mikefarah/yq/issues/515
    # For preserving blank lines, diff+patch approach would be needed, but functionality is preserved
    yq eval '.plugins.ton[0].gitRef = "'"$CURRENT_TON_COMMIT"'"' -i "$PLUGINS_FILE"
    log_info "Updated TON plugin gitRef to: $CURRENT_TON_COMMIT"
  else
    log_error "plugins.public.yaml not found at $PLUGINS_FILE"
    log_error "This file is required for plugin configuration."
    exit 1
  fi
}

# replace chainlink-ton modules with local versions in core repository
replace_ton_modules() {
  log_info "Replacing chainlink-ton dependencies with local version..."
  
  # scan for go.mod files that use chainlink-ton
  find "$CHAINLINK_CORE_DIR" -name "go.mod" -type f -print0 | while IFS= read -r -d '' gomod; do
    dir=$(dirname "$gomod")
    
    # check if any chainlink-ton modules are used
    needs_update=false
    for mod in "${!TON_MODULES[@]}"; do
      if grep -q "$mod" "$gomod"; then
        needs_update=true
        break
      fi
    done
    
    if [ "$needs_update" = true ]; then
      log_info "  Updating ${dir#$CHAINLINK_CORE_DIR/}"
      
      pushd "$dir" > /dev/null
      for mod in "${!TON_MODULES[@]}"; do
        if grep -q "$mod" go.mod; then
          log_info "    $mod -> ${TON_MODULES[$mod]}"
          go mod edit -replace="$mod=${TON_MODULES[$mod]}"
        fi
      done
      popd > /dev/null
    fi
  done
  
  go run github.com/jmank88/gomods@v0.1.6 tidy
  log_info "Module replacements complete"
}

# prepare test database schema using preparetest command
prepare_test_database() {
  go run ./core/store/cmd/preparetest
}

# --------------------------------------------------
# main logic
# --------------------------------------------------

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

# get absolute path to chainlink core directory
CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

log_info "=== CHAINLINK TON CCIP - E2E Test Environment Setup ==="
log_info "Current chainlink-ton commit: $CURRENT_TON_COMMIT"

log_info "Using Chainlink TON: $ROOT_DIR"
validate_project_dir "$ROOT_DIR" "Chainlink TON"

log_info "Using Chainlink Core: $CHAINLINK_CORE_DIR"
validate_project_dir "$CHAINLINK_CORE_DIR" "Chainlink Core"

validate_core_version "$CHAINLINK_CORE_DIR"

setup_postgres

(
  log_info "Preparing Chainlink Core (dependencies, build, DB setup)..."
  cd "$CHAINLINK_CORE_DIR"
  log_info "Active Go version: $(go version)"

  update_plugin_config
  replace_ton_modules
  prepare_test_database
)

log_info "=================================="
log_info "Environment setup complete."
log_info "Chainlink Core Directory used: $CHAINLINK_CORE_DIR"
log_info "Root Directory used: $ROOT_DIR"
log_info "Please ensure CL_DATABASE_URL is exported in your environment before running tests."
log_info "export CL_DATABASE_URL=${CL_DATABASE_URL}"
log_info "=================================="
log_info "IMPORTANT: Please note this setup makes the following changes to chainlink core:"
log_info "  1. Replaces chainlink-ton module dependencies with local versions"
log_info "  2. Updates TON plugin gitRef in plugins.public.yaml to: ${CURRENT_TON_COMMIT}"
log_info "This will use your local chainlink-ton code and submodules in the core repo."
log_info "=================================="
