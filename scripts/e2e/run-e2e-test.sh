#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
CHAINLINK_TON_DIR=$(realpath "${SCRIPT_DIR}/../..")
DEFAULT_CHAINLINK_CORE_DIR="${CHAINLINK_TON_DIR}/../chainlink"
DB_URL="postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable"

# variables & helpers
ARG_CORE_DIR=""
ARG_CORE_REF=""
ARG_TEST_COMMAND=""

log_info() {
  echo "INFO: $1"
}
log_error() {
  echo "ERROR: $1" >&2
}

# argument parsing and validation
while [[ $# -gt 0 ]]; do
  case "$1" in
  -c | --core-dir)
    ARG_CORE_DIR="$2"
    shift 2
    ;;
  -r | --core-ref)
    ARG_CORE_REF="$2"
    shift 2
    ;;
  --test-command)
    ARG_TEST_COMMAND="$2"
    shift 2
    ;;
  *)
    log_error "Unknown option: $1"
    echo "Usage: $0 --test-command <cmd> [-c <core_dir>] [-r <core_ref>]"
    exit 1
    ;;
  esac
done

if [ -z "$ARG_TEST_COMMAND" ]; then
  # example: "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -test.parallel=2 -count=1 -json"
  log_error "--test-command is a required argument."
  exit 1
fi

CHAINLINK_CORE_DIR=$(realpath "${ARG_CORE_DIR:-$DEFAULT_CHAINLINK_CORE_DIR}")

log_info "=== CCIP Integration Test Runner ==="
log_info "Using Chainlink TON: $CHAINLINK_TON_DIR"
log_info "Using Chainlink Core: $CHAINLINK_CORE_DIR"
log_info "Database URL (hardcoded): $DB_URL"
log_info "Test Command: $ARG_TEST_COMMAND"

if [ -n "$ARG_CORE_REF" ]; then
  log_info "Chainlink Core Ref (target): $ARG_CORE_REF"
fi

if [ ! -d "$CHAINLINK_TON_DIR" ] || [ ! -f "$CHAINLINK_TON_DIR/go.mod" ]; then
  log_error "Invalid Chainlink TON directory: $CHAINLINK_TON_DIR"
  exit 1
fi
if [ ! -d "$CHAINLINK_CORE_DIR" ] || [ ! -f "$CHAINLINK_CORE_DIR/go.mod" ]; then
  log_error "Invalid Chainlink Core directory: $CHAINLINK_CORE_DIR"
  exit 1
fi

# env setup & build, in local development core_ref is not needed, it will use the current checked out branch.
if [ -n "$ARG_CORE_REF" ]; then
  log_info "Ensuring Chainlink Core ref is: $ARG_CORE_REF"
  (
    cd "$CHAINLINK_CORE_DIR"
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$ARG_CORE_REF^{commit}" 2>/dev/null)" ]; then
      log_info "Current Chainlink Core ref ($(git rev-parse --abbrev-ref HEAD), $(git rev-parse HEAD)) differs from target. Fetching and checking out..."
      git fetch --all --tags --prune
      if ! git checkout "$ARG_CORE_REF"; then # Changed from ARG_CHAINLINK_SHA
        log_error "Failed to checkout Chainlink Core ref: $ARG_CORE_REF"
        exit 1
      fi
    else
      log_info "Chainlink Core already at target ref."
    fi
    log_info "Chainlink Core at ref: $(git rev-parse HEAD) ($(git rev-parse --abbrev-ref HEAD))"
  )
fi

log_info "Preparing Chainlink Core (dependencies, build, DB setup)..."
(
  cd "$CHAINLINK_CORE_DIR"
  log_info "Active Go version: $(go version)"

  # TODO: hacky fix for "gomods: command not found"
  GO_BIN_DIR=$(go env GOBIN)
  [ -z "$GO_BIN_DIR" ] && GO_BIN_DIR="$(go env GOPATH)/bin"
  if [ "$GO_BIN_DIR" = "/bin" ] || [ -z "$GO_BIN_DIR" ]; then
    GO_BIN_DIR="$HOME/go/bin"
  fi
  log_info "Ensuring $GO_BIN_DIR is in PATH"
  export PATH="$GO_BIN_DIR:$PATH"

  # modify go.mod to use local chainlink-ton
  go mod edit -replace="github.com/smartcontractkit/chainlink-ton=$CHAINLINK_TON_DIR"
  make gomodtidy

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
