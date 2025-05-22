#!/bin/bash
set -euo pipefail

# configuration & global variables
ROOT_DIR=$(git rev-parse --show-toplevel)
DEFAULT_CHAINLINK_CORE_DIR="${ROOT_DIR}/../chainlink"
CORE_VERSION_FILE_PATH="${ROOT_DIR}/scripts/e2e/.core_version"
DB_URL="postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable"

ARG_CORE_DIR=""
ARG_TEST_COMMAND=""

log_info() {
  echo "INFO: $1"
}

log_error() {
  echo "ERROR: $1" >&2
}

print_usage() {
  echo "Usage: $0 --test-command <cmd> [-c|--core-dir <core_dir>]" >&2
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
  --test-command)
    ARG_TEST_COMMAND="$2"
    shift 2
    ;;
  *)
    log_error "Unknown option: $1"
    print_usage
    exit 1
    ;;
  esac
done

if [ -z "$ARG_TEST_COMMAND" ]; then
  # example: "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -test.parallel=2 -count=1 -json"
  log_error "--test-command is a required argument."
  print_usage
  exit 1
fi

CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

log_info "=== CCIP Integration Test Runner ==="
log_info "Using Chainlink TON: $ROOT_DIR"
log_info "Using Chainlink Core: $CHAINLINK_CORE_DIR"
log_info "Test Database URL: $DB_URL"
log_info "Test Command: $ARG_TEST_COMMAND"

validate_project_dir "$ROOT_DIR" "Chainlink TON"
validate_project_dir "$CHAINLINK_CORE_DIR" "Chainlink Core"

log_info "Verifying Chainlink Core version..."

if [ ! -f "$CORE_VERSION_FILE_PATH" ]; then
  log_error "Core version file not found: $CORE_VERSION_FILE_PATH"
  exit 1
fi

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

log_info "Preparing Chainlink Core (dependencies, build, DB setup)..."
(
  cd "$CHAINLINK_CORE_DIR"
  log_info "Active Go version: $(go version)"

  # modify go.mod to use local chainlink-ton
  go mod edit -replace="github.com/smartcontractkit/chainlink-ton=$ROOT_DIR"
  go run github.com/jmank88/gomods@v0.1.5 tidy

  # download go vendor packages
  go mod download
  if [ -f "./integration-tests/go.mod" ]; then
    (cd "./integration-tests" && go mod download)
  fi
  # build the ccip test binary
  go build -o ccip.test .
  export CL_DATABASE_URL="$DB_URL"

  # setup the database
  ./ccip.test local db preparetest
)

log_info "Executing Test Command in $CHAINLINK_CORE_DIR: $ARG_TEST_COMMAND"
(cd "$CHAINLINK_CORE_DIR" && eval "$ARG_TEST_COMMAND")
log_info "=================================="
log_info "Test command execution finished."
