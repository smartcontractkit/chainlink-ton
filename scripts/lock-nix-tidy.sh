#!/usr/bin/env bash
set -euo pipefail

if ((BASH_VERSINFO[0] < 4)); then
  echo "lock-nix-tidy: bash >= 4 required (run 'nix run .#lock-nix-tidy')." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# lock-nix-tidy — update lock.nix hashes after a dependency bump.
#
#   nix run .#lock-nix-tidy               # every package
#   nix run .#lock-nix-tidy -- <attr>     # just one package
#
# For each package, for each of its dependency fetchers — the fixed-output
# derivations it directly needs, i.e. whatever pins fetched content:
#
#   1. discover_fetchers: ask Nix which of the package's direct input
#      derivations are fixed-output. Only those can raise "hash mismatch".
#   2. build_fetcher: force a real re-fetch with --rebuild, the only honest
#      check: a fixed-output's output path is keyed by its DECLARED hash, so
#      on stale state even a full build finds the old output and reports OK
#      in milliseconds without fetching (measured: 0.05s on a changed
#      manifest). ~10-14s per fetcher; packages are never compiled.
#   3. On "specified: X / got: Y", rewrite X -> Y in every lock.nix
#      mentioning X, then start over: the fix changed the fetcher's inputs,
#      so its drv path — and the worklist — moved with it.
#   4. Repeat until green (at most MAX_RETRIES times).
#
# -----------------------------------------------------------------------------

MAX_RETRIES="${LOCK_NIX_TIDY_MAX_RETRIES:-5}"

log() { echo "[lock-nix-tidy] $*" >&2; }
die() { echo "[lock-nix-tidy] ERROR: $*" >&2; exit 1; }

# The shell's Nix (e.g. Determinate) may reject this wrapper's nix.conf keys;
# strip that chatter. sed always exits 0, so pipefail keeps Nix's status.
nix_filter() { sed -E '/^(warning|error): unknown setting /d'; }

human_fetcher() { basename "${1%.drv}" | sed -E 's|^[0-9a-z]{32}-||'; }

# Drvs honestly verified by this run: each builds at most once. Keyed by drv
# path, never by declared hash — the path hashes inputs and build procedure,
# the declared hash is only the hypothesis under test, and attrs sharing one
# can still build differently. True hits are the common case: several attrs
# sharing one fetcher drv.
declare -A VERIFIED=()

# Positional args = package attrs to tidy; default = everything the flake
# exposes for this system (flake-show JSON keys .packages by system).
# NOTE: Determinate's nix prints .packages=null for `flake show --json`
# (it serves an "inventory" schema instead), so run the tool through
# `nix run .#lock-nix-tidy` — the wrapper always uses vanilla nix.
PKGS=("$@")
if [[ ${#PKGS[@]} -eq 0 ]]; then
  system=$(nix eval --impure --expr builtins.currentSystem --raw)
  mapfile -t PKGS < <(
    nix flake show --json 2>/dev/null |
      jq -r --arg s "$system" '.packages[$s] // empty | keys[]' |
      sort
  )
  [[ ${#PKGS[@]} -gt 0 ]] || die "This flake exposes no packages to tidy (or your shell's nix is Determinate: use 'nix run .#lock-nix-tidy')."
fi

mapfile -t LOCK_FILES < <(find . -type f -name lock.nix | sort)
[[ ${#LOCK_FILES[@]} -gt 0 ]] || die "No lock.nix files found."

# Print one fetcher drv path per line for a package attr: its direct inputs
# carrying the fixed-output marker (.outputs.out.hash in the v4 `nix
# derivation show` schema; covers structured-attr fetchers too; vanilla
# >= 2.28 guaranteed by the `nix run` wrapper, as for the flake-show
# enumeration). Direct inputs only is the adoption contract: a fetcher this
# tool manages must be a direct input of an exposed package.
#
# Sentinel lines instead of a silently short list:
#   NO_DRV  attr is not a derivation (typo) — caller reports and skips
#   FAIL    a read failed or the schema drifted — must never look like
#           "no fetchers", or a stale lock would stay stale with CI green
discover_fetchers() {
  local attr=$1 json d out ins rc
  json=$(nix derivation show ".#${attr}" 2>/dev/null) || { echo NO_DRV; return 0; }
  if ! ins=$(echo "$json" | jq -r '
      .derivations | to_entries[0].value | .inputs.drvs // {}
      | keys[] | "/nix/store/" + .'); then
    log "unexpected 'nix derivation show' schema for .$attr (needs vanilla Nix >= 2.28; run 'nix run .#lock-nix-tidy')"
    echo FAIL
    return 0
  fi
  for d in ${ins:-}; do
    out=$(nix derivation show "$d" 2>/dev/null) ||
      { log "cannot read input derivation $d (of .$attr)"; echo FAIL; return 0; }
    rc=0
    echo "$out" | jq -e '.derivations | to_entries[0].value | .outputs.out.hash' >/dev/null || rc=$?
    if ((rc > 1)); then
      log "unexpected 'nix derivation show' schema for $d"
      echo FAIL
      return 0
    fi
    if ((rc == 0)); then echo "$d"; fi
  done
}

# Parse specified/got hashes out of a captured build error log and rewrite
# the former with the latter in every lock.nix that mentions the former.
update_from_err() {
  local errfile=$1 specified got lf touched=0
  specified=$(grep -m1 -Eo 'specified: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true
  got=$(grep -m1 -Eo 'got: +sha256-[A-Za-z0-9+/=]+' "$errfile" | awk '{print $2}') || true
  [[ -n ${specified:-} && -n ${got:-} ]] || { log "No parsable hashes in error log."; return 1; }
  for lf in "${LOCK_FILES[@]}"; do
    if grep -qF -- "$specified" "$lf"; then
      log "Updating $lf: $specified → $got"
      # cat > writes through the original inode, preserving the file's mode.
      sed "s|$specified|$got|g" "$lf" > "$lf.tmp" && cat "$lf.tmp" > "$lf" && rm -f "$lf.tmp"
      touched=1
    fi
  done
  [[ $touched -eq 1 ]] || { log "Hash $specified is not in any lock.nix."; return 1; }
}

# Rebuild one fetcher. 0 = verified, 10 = hash fixed (caller re-discovers),
# 1 = unfixable. `^out` is required: a bare .drv only realises the
# derivation file, never runs the builder.
build_fetcher() {
  local drv=$1 label=$2 err attempt
  # One drv is built at most once per run — see VERIFIED.
  if [[ -n ${VERIFIED[$drv]:-} ]]; then
    log "$label skip: verified earlier in this run ($(human_fetcher "$drv"))"
    return 0
  fi
  err=$(mktemp)
  # --rebuild per header step 2. Nix refuses it for never-built outputs
  # ("not valid, so checking is not possible"); there a plain build is
  # equivalent — with no valid output the fetcher has to run anyway.
  local flags=(--rebuild)
  for attempt in 1 2; do
    : > "$err"
    if nix build "${flags[@]}" --no-link "${drv}^out" --print-build-logs 2>&1 |
      nix_filter | tee "$err" >&2; then
      rm -f "$err"
      VERIFIED[$drv]=1
      log "$label OK: $(human_fetcher "$drv")"
      return 0
    fi
    if grep -q "not valid, so checking is not possible" "$err"; then
      log "$label expected: output never built under this hash yet; building plain"
      flags=()
      continue
    fi
    if grep -q "hash mismatch in fixed-output derivation" "$err"; then
      if update_from_err "$err"; then
        rm -f "$err"
        return 10
      fi
      break
    fi
    [[ $attempt -eq 1 ]] || break
    log "$label build failed for a non-hash reason; retrying once…"
    sleep 5
  done
  log "$label FAILED. Error log:"
  cat "$err" >&2
  rm -f "$err"
  return 1
}

# Tidy one package: discover, verify, fix — looping while a fix was made,
# since each fix moves the fetchers' store paths and worklist with it.
tidy_attr() {
  local attr=$1 attempt rc f fixed
  local -a fetchers
  for ((attempt = 1; attempt <= MAX_RETRIES; attempt++)); do
    mapfile -t fetchers < <(discover_fetchers "$attr")
    if [[ ${#fetchers[@]} -eq 1 && "${fetchers[0]}" == NO_DRV ]]; then
      log "[$attr] not a derivation; skipping."
      return 0
    fi
    if [[ ${#fetchers[@]} -eq 0 ]]; then
      log "[$attr] no pinned-hash inputs; nothing to check."
      return 0
    fi
    # FAIL can trail valid paths (discovery died mid-list), so scan the whole
    # list — and only now, when it is non-empty, is "nothing found" ruled out.
    if printf '%s\n' "${fetchers[@]}" | grep -qx FAIL; then
      log "[$attr] fetcher discovery failed; refusing to guess (see messages above)."
      return 1
    fi
    fixed=0
    for f in "${fetchers[@]}"; do
      rc=0
      build_fetcher "$f" "[$attr]" || rc=$?
      if [[ $rc -eq 10 ]]; then fixed=1; break; elif [[ $rc -ne 0 ]]; then return 1; fi
    done
    [[ $fixed -eq 0 ]] && return 0
    log "[$attr] hash updated; re-checking (attempt $((attempt + 1))/$MAX_RETRIES)"
  done
  log "[$attr] hash did not converge after $MAX_RETRIES updates"
  return 1
}

FAILED=()
for p in "${PKGS[@]}"; do
  tidy_attr "$p" || FAILED+=("$p")
done
[[ ${#FAILED[@]} -eq 0 ]] || die "Could not tidy: ${FAILED[*]}"

log "All fetchers match their pinned hashes. If hashes were updated, commit your changes."
