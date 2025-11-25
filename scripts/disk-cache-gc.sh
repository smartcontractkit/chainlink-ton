#!/usr/bin/env bash
# Reclaim disk from Nix and Yarn, safely and idempotently.
set -euo pipefail

log() { printf '[gc] %s\n' "$*" >&2; }

gc_nix() {
  if command -v nix >/dev/null 2>&1; then
    log "Nix: collect garbage (delete old generations, free unreferenced paths)"
    nix-collect-garbage -d
    nix store gc
    log "Nix: deduplicate store"
    nix store optimise
  fi
}

gc_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    log "Yarn: cleaning cache"
    # Works for Yarn v1 and Berry (v2+)
    yarn cache clean
  fi
}

gc_yarn
gc_nix

# Show space for visibility
df -h
