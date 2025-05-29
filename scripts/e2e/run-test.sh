#!/usr/bin/env bash

# This script executes end-to-end (e2e) tests for Chainlink CCIP.
# It performs the following main actions:
#   1. Defines and validates the path for the Chainlink Core repository.
#   2. Verifies that the Chainlink Core repository is at the blessed commit specified in .core_version.
#   3. Checks if the CL_DATABASE_URL environment variable is set (expected to be exported after running setup-env.sh).
#   4. Executes the provided test command within the Chainlink Core directory.
#
# Usage: ./scripts/e2e/run-test.sh --test-command <cmd> [-c|--core-dir <core_dir>]
#
# Arguments:
#   --test-command <cmd>: Required. The command to execute for running the tests.
#                         This command will be run from within the Chainlink Core directory.
#   -c, --core-dir <core_dir>: Optional. Path to the Chainlink Core directory.
#                              Defaults to ../chainlink relative to the script's root directory.
#
# Environment Variables:
#   CL_DATABASE_URL: Required. The URL for the test database. This script checks for its presence.
#                    It's is not shared between subshells, so it needs to be exported explicitly when running tests separately.
#
# Notes:
#   - This script should typically be run after ./scripts/e2e/setup-env.sh has successfully completed and exported CL_DATABASE_URL.
#   - Ensure that the blessed commit in .core_version is accessible in the Chainlink Core repository.

set -euo pipefail

# configuration & global variables
ROOT_DIR=$(git rev-parse --show-toplevel)
DEFAULT_CHAINLINK_CORE_DIR="${ROOT_DIR}/../chainlink"
CORE_VERSION_FILE_PATH="${ROOT_DIR}/scripts/.core_version"

# configurable arguments
ARG_CORE_DIR=""
ARG_TEST_COMMAND=""

log_info() {
  echo "INFO: $1"
}

log_error() {
  echo "ERROR: $1" >&2
}

print_usage_run() {
  echo "Usage: $0 --test-command <cmd> [-c|--core-dir <core_dir>]" >&2
}

# argument parsing and validation
while [[ $# -gt 0 ]]; do
  case "$1" in
  -c | --core-dir)
    ARG_CORE_DIR="$2"
    shift 2
    ;;
  --test-command)
    ARG_TEST_COMMAND="$2"
    shift 2
    ;;
  *)
    log_error "Unknown option: $1"
    print_usage_run
    exit 1
    ;;
  esac
done

if [ -z "$ARG_TEST_COMMAND" ]; then
  log_error "--test-command is a required argument."
  print_usage_run
  exit 1
fi

CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

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
  log_error "Please checkout the correct commit/branch in '$CHAINLINK_CORE_DIR' or run setup-env.sh."
  exit 1
else
  log_info "Chainlink Core version matches. Current commit: $CURRENT_CORE_COMMIT"
fi

# test database URL availability validation
if [ -z "${CL_DATABASE_URL:-}" ]; then
  log_error "CL_DATABASE_URL is not set. Please ensure CL_DATABASE_URL is exported (e.g. by running setup-env.sh)."
  exit 1
fi

log_info "=== CCIP Test Execution ==="
log_info "Using Chainlink Core: $CHAINLINK_CORE_DIR"
log_info "Using Database URL: $CL_DATABASE_URL"
log_info "Test Command: $ARG_TEST_COMMAND"

log_info "Executing Test Command in $CHAINLINK_CORE_DIR: $ARG_TEST_COMMAND"
(cd "$CHAINLINK_CORE_DIR" && eval "$ARG_TEST_COMMAND")
log_info "=================================="
log_info "Test command execution finished."
