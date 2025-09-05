# ===============================
# scripts/lock-nix-tidy.sh
# ===============================
#!/usr/bin/env bash
set -euo pipefail

# --- config knobs ---
MAX_PASSES=${MAX_PASSES:-5}
VERBOSE=${VERBOSE:-1}

log()  { [ "$VERBOSE" -ge 1 ] && echo "[lock-nix-tidy] $*" >&2; }

# Find all lock.nix files once
mapfile -t LOCK_FILES < <(find . -type f -name lock.nix | sort)
if [ ${#LOCK_FILES[@]} -eq 0 ]; then
  log "No lock.nix files found. Exiting with no changes."
  exit 0
fi

SYSTEM=$(nix eval --impure --expr builtins.currentSystem --raw)

# Discover all package attribute names for this system
mapfile -t PKGS < <(
  nix flake show --all-systems --json \
  | jq -r ".packages[\"$SYSTEM\"] | keys[]?" \
  | sort
)

if [ ${#PKGS[@]} -eq 0 ]; then
  log "No packages exposed by flake for system $SYSTEM. Nothing to build."
  exit 0
fi


replace_hashes_in_locks() {
  local from=$1
  local to=$2
  local replaced_any=0
  for lf in "${LOCK_FILES[@]}"; do
    if grep -q -- "$from" "$lf"; then
      log "Updating lock.nix: $lf"
      sed -i "s|$from|$to|g" "$lf"
      replaced_any=1
    fi
  done
  echo "$replaced_any"
}

handle_hash_mismatch() {
  local errfile=$1

  # Extract first pair (specified/got) from error log
  local specified got
  specified=$(grep -m1 -Eo 'specified: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true
  got=$(grep -m1 -Eo 'got: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true

  if [[ -z "${specified:-}" || -z "${got:-}" ]]; then
    log "Could not parse mismatch hashes; leaving error intact."
    return 1
  fi

  log "Found mismatch: $specified -> $got"
  local did
  did=$(replace_hashes_in_locks "$specified" "$got")
  if [ "$did" -eq 0 ]; then
    log "Hash $specified not found in any lock.nix. You may need to add it to lock.nix extraction."
    return 1
  fi

  return 0
}

build_one() {
  local attr=$1
  local err
  err=$(mktemp)
  log "Building #$attr"
  if nix build ".#$attr" --print-build-logs --log-format bar-with-logs 2> >(tee "$err" >&2); then
    rm -f "$err"
    return 0
  fi

  if grep -q "hash mismatch in fixed-output derivation" "$err"; then
    log "Fixed-output hash mismatch encountered while building $attr"
    if handle_hash_mismatch "$err"; then
      log "Updated hashes. Retrying $attr..."
      rm -f "$err"
      if nix build ".#$attr" --print-build-logs --log-format bar-with-logs \
           2> >(tee "$err" >&2); then
        rm -f "$err"
        return 0
      fi
      if grep -q "hash mismatch in fixed-output derivation" "$err"; then
        rm -f "$err"
        return 2
      fi
    fi
  fi

  # Unknown failure or unhandled case; surface full error
  log "Build of $attr failed with a non-hash error. Showing tail:"
  tail -n +1 "$err" >&2
  rm -f "$err"
  return 3
}


# Main loop: multiple passes to converge if many packages change hashes
pass=1
changed=0
while [ $pass -le "$MAX_PASSES" ]; do
  log "Pass $pass/$MAX_PASSES — building ${#PKGS[@]} packages for $SYSTEM"
  changed=0
  for p in "${PKGS[@]}"; do
    # Keep retrying a package if we keep hitting new mismatches for it
    while true; do
      if build_one "$p"; then
        break
      else
        rc=$?
        if [ $rc -eq 2 ]; then
          # another mismatch fixed; mark changed and continue loop to retry same pkg
          changed=1
          continue
        else
          # non-hash failure; abort with error code
          exit $rc
        fi
      fi
    done
  done

  if [ $changed -eq 0 ]; then
    log "All packages built successfully with current hashes."
    exit 0
  fi
  pass=$((pass+1))
  log "Hashes updated in this pass; running another pass to converge..."
done

log "Reached MAX_PASSES=$MAX_PASSES. You may need to run again if more updates remain."
exit 0
