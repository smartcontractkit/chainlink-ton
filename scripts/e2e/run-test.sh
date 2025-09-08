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

# source shared library
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "${SCRIPT_DIR}/lib.sh"

# configurable arguments
ARG_CORE_DIR=""
ARG_TEST_COMMAND=""

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

# --------------------------------------------------
# main logic
# --------------------------------------------------

CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

validate_core_version "$CHAINLINK_CORE_DIR"

verify_plugin_config "$CHAINLINK_CORE_DIR"

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
