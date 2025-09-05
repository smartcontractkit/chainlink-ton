#!/usr/bin/env bash

# shared library for e2e testing scripts
# this file contains common functions and constants used across e2e scripts

# ensure this script is being sourced, not executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "ERROR: This script should be sourced, not executed directly." >&2
  echo "Usage: source lib.sh" >&2
  exit 1
fi

# common configuration & global variables
ROOT_DIR=$(git rev-parse --show-toplevel)
DEFAULT_CHAINLINK_CORE_DIR="${ROOT_DIR}/../chainlink"
CORE_VERSION_FILE_PATH="${ROOT_DIR}/scripts/.core_version"
CURRENT_TON_COMMIT=$(cd "$ROOT_DIR" && git rev-parse HEAD)
BLESSED_CORE_REF=$(tr -d '[:space:]' <"${ROOT_DIR}/scripts/.core_version")

# ton modules that need to be replaced in core repository
declare -A TON_MODULES=(
  ["github.com/smartcontractkit/chainlink-ton"]="$ROOT_DIR"
  ["github.com/smartcontractkit/chainlink-ton/deployment"]="$ROOT_DIR/deployment"
  ["github.com/smartcontractkit/chainlink-ton/integration-tests"]="$ROOT_DIR/integration-tests"
)

# logging functions
log_info() {
  echo "INFO: $1"
}

log_error() {
  echo "ERROR: $1" >&2
}

# validate that a project directory exists and contains go.mod
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

# validate that the current chainlink core commit matches the blessed version
validate_core_version() {
  local chainlink_core_dir="$1"
  
  log_info "Verifying Chainlink Core version..."

  # check core version file
  if [ ! -f "$CORE_VERSION_FILE_PATH" ]; then
    log_error "Core version file not found: $CORE_VERSION_FILE_PATH"
    exit 1
  fi

  # checked out core ref validation
  if [ -z "$BLESSED_CORE_REF" ]; then
    log_error "Core version file is empty: $CORE_VERSION_FILE_PATH"
    exit 1
  fi
  log_info "Expected Chainlink Core ref (from .core_version): $BLESSED_CORE_REF"

  if ! CURRENT_CORE_COMMIT=$(cd "$chainlink_core_dir" && git rev-parse HEAD); then
    log_error "Failed to get current commit from Chainlink Core directory '$chainlink_core_dir'"
    log_error "Ensure the directory exists and is a valid git repository with commits."
    exit 1
  fi

  BLESSED_CORE_REF_COMMIT=$(cd "$chainlink_core_dir" && git rev-parse --verify "$BLESSED_CORE_REF^{commit}" 2>/dev/null)
  if [ -z "$BLESSED_CORE_REF_COMMIT" ]; then
    log_error "Failed to resolve blessed Chainlink Core ref '$BLESSED_CORE_REF' to a commit in '$chainlink_core_dir'."
    log_error "Ensure the ref exists and is fetched (e.g., run 'git fetch --all' in '$chainlink_core_dir')."
    exit 1
  fi

  if [ "$CURRENT_CORE_COMMIT" != "$BLESSED_CORE_REF_COMMIT" ]; then
    log_error "Chainlink Core version mismatch!"
    log_error "  Current commit in '$chainlink_core_dir': $CURRENT_CORE_COMMIT"

    # Find which branch contains this commit
    CONTAINING_BRANCH=$(cd "$chainlink_core_dir" && git branch -r --contains "$BLESSED_CORE_REF_COMMIT" 2>/dev/null | head -1 | sed 's/.*origin\///' | xargs)

    if [ -n "$CONTAINING_BRANCH" ]; then
      log_error "  Expected commit: $BLESSED_CORE_REF_COMMIT (from branch: $CONTAINING_BRANCH)"
      log_error "  This may be a specific stable commit, not the branch tip."
      log_error "  Run: cd '$chainlink_core_dir' && git checkout $BLESSED_CORE_REF_COMMIT"
      log_error "  Note: This will put you in detached HEAD state, which is expected for this pinned version."
    else
      log_error "  Expected commit: $BLESSED_CORE_REF_COMMIT (you may need to fetch first)"
      log_error "  Run: cd '$chainlink_core_dir' && git fetch && git checkout $BLESSED_CORE_REF_COMMIT"
    fi
    exit 1
  else
    log_info "Chainlink Core version matches. Current commit: $CURRENT_CORE_COMMIT"
  fi
}

# verify that ton plugin gitref matches current chainlink-ton commit
verify_plugin_config() {
  local chainlink_core_dir="$1"
  
  log_info "Verifying TON plugin configuration..."
  
  PLUGINS_FILE="$chainlink_core_dir/plugins/plugins.public.yaml"
  
  if [ ! -f "$PLUGINS_FILE" ]; then
    log_error "plugins.public.yaml not found at $PLUGINS_FILE"
    exit 1
  fi
  
  # extract current gitRef from plugins.public.yaml
  PLUGIN_GIT_REF=$(yq eval '.plugins.ton[0].gitRef' "$PLUGINS_FILE" 2>/dev/null)
  
  if [ -z "$PLUGIN_GIT_REF" ] || [ "$PLUGIN_GIT_REF" = "null" ]; then
    log_error "Failed to read TON plugin gitRef from plugins.public.yaml"
    exit 1
  fi
  
  log_info "Current chainlink-ton commit: $CURRENT_TON_COMMIT"
  log_info "TON plugin gitRef in core: $PLUGIN_GIT_REF"
  
  if [ "$CURRENT_TON_COMMIT" != "$PLUGIN_GIT_REF" ]; then
    log_error "TON plugin gitRef mismatch!"
    log_error "  Current chainlink-ton commit: $CURRENT_TON_COMMIT"
    log_error "  Plugin gitRef in core: $PLUGIN_GIT_REF"
    log_error "  Please run setup-env.sh to update the plugin configuration."
    exit 1
  else
    log_info "TON plugin gitRef matches current commit"
  fi
}
