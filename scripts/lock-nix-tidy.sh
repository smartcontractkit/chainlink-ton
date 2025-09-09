#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# lock-nix-tidy
# -----------------------------------------------------------------------------
# Fixes “hash mismatch in fixed-output derivation” errors by updating hashes
# in any lock files named `lock.nix` (found recursively from the repo root).
#
# USAGE
#   nix run .#lock-nix-tidy              # build & tidy ALL packages for this system
#   nix run .#lock-nix-tidy -- <attr>    # build & tidy only the given package attr
#
# EXAMPLES
#   nix run .#lock-nix-tidy -- chainlink-ton
#
# NOTES
# - Nix prints progress/logs to stderr. We tee stderr so you see live logs AND we
#   still capture them for parsing.
# - We only edit files literally named `lock.nix`.
# - When a mismatch is detected, we update the hash and immediately retry the
#   same package. We do a single overall pass across packages to keep things
#   simple—run again if you continue to see mismatches after the first pass.
# -----------------------------------------------------------------------------

log() { echo "[lock-nix-tidy] $*" >&2; }

die() { echo "[lock-nix-tidy] ERROR: $*" >&2; exit 1; }

# Optional target attribute (positional arg after -- if invoked via nix run)
TARGET_ATTR=${1:-}

# Find lock.nix files once
mapfile -t LOCK_FILES < <(find . -type f -name lock.nix | sort)
[ ${#LOCK_FILES[@]} -gt 0 ] || log "No lock.nix files found; will still attempt builds."

# Get list of packages for current system (unless a specific attr was requested)
SYSTEM=$(nix eval --impure --expr builtins.currentSystem --raw)
if [[ -n "${TARGET_ATTR}" ]]; then
  PKGS=("${TARGET_ATTR}")
else
  mapfile -t PKGS < <(
    nix flake show --json --all-systems \
    | jq -r ".packages[\"$SYSTEM\"] | keys[]?" \
    | sort
  )
fi

[ ${#PKGS[@]} -gt 0 ] || die "No packages exposed by this flake for $SYSTEM, and no attr provided."

# Parse the first "specified" and "got" sha256 from a Nix error log file,
# and replace occurrences in any lock.nix file.
update_from_err() {
  local errfile=$1
  local specified got

  specified=$(grep -m1 -Eo 'specified: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true
  got=$(grep -m1 -Eo 'got: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true

  if [[ -z "${specified:-}" || -z "${got:-}" ]]; then
    log "No parsable hashes found in error log."
    return 1
  fi

  local touched=0
  for lf in "${LOCK_FILES[@]}"; do
    if grep -q -- "$specified" "$lf"; then
      log "Updating $lf: $specified → $got"
      sed -i "s|$specified|$got|g" "$lf"
      touched=1
    fi
  done

  if [[ $touched -eq 0 ]]; then
    log "Hash $specified not found in any lock.nix; adjust your lock extraction."
    return 1
  fi
  return 0
}

build_attr() {
  local attr=$1

  while true; do
    log "Building $attr"
    local err; err=$(mktemp)

    # Show logs live and capture them for parsing
    if nix build ".#${attr}" --print-build-logs 2> >(tee "$err" >&2); then
      rm -f "$err"
      log "Build finished successfully for $attr"
      return 0
    fi

    if grep -q "hash mismatch in fixed-output derivation" "$err"; then
      if update_from_err "$err"; then
        log "Hash updated; retrying $attr"
        rm -f "$err"
        continue
      fi
    fi

    log "Build failed for $attr. Last error log:"; tail -n +1 "$err" >&2
    rm -f "$err"
    return 1
  done
}

# Single pass across the package set
for p in "${PKGS[@]}"; do
  build_attr "$p" || exit 1
done

log "All requested builds finished. If hashes were updated, commit your changes."
