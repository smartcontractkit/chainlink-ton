---
id: dev-guides-nix-builds
title: Builds
sidebar_label: Builds
sidebar_position: 2
---

# Builds - Nix

## Building packages

Every buildable artifact in this repo is exposed as a Nix package.

List all packages:

```bash
nix flake show
```

Build a Nix package:

```bash
nix build .# --print-out-paths      # default pkg
nix build .#<pkg> --print-out-paths # labeled pkg
```

## Deterministic builds, vendor hashes, and lock files

Nix aims for deterministic builds, which rests on **fixed-output derivations (FODs)** — `fetchurl`, `buildGoModule`’s vendor step, `fetchgit`, etc. Each declares its **content hash** up front, and the build fails with “hash mismatch in fixed-output derivation” unless the fetched content hashes to exactly that. This keeps CI and local builds on identical inputs.

### Why vendor hashes need to be pinned

Everything fetched from upstream (Go modules, npm/yarn, tarballs…) is pinned by its **expected content hash** — e.g. `vendorHash` for `buildGoModule`. Bump a dependency, the fetched content changes, the pinned hash goes stale, and Nix refuses the build until it is updated.

### Organizing hashes in `lock.nix`

Pinned hashes live in small `lock.nix` files (one per package or group) that derivations **import** instead of inlining:

```nix
# <path>/my-module/lock.nix
{
  foo-service= "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
}
```

```nix
# pkgs/my-module/default.nix
{ pkgs, ... }: let
    lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
in pkgs.buildGoModule {
  pname = "foo-service";
  version = "0.0.1";

  # Pull the pinned value from lock.nix
  vendorHash = lock.foo-service;

  # ...
}
```

Benefits:

* All updates appear as small diffs to `lock.nix`.
* Code stays clean; reviewers can focus on logic vs. hash churn.
* Tools can safely search/replace hashes without touching derivation logic.

### Automating updates with `lock-nix-tidy`

**lock-nix-tidy** re-verifies dependency fetchers and updates `lock.nix` for you when a hash goes stale:

```bash
error: hash mismatch in fixed-output derivation
          specified: sha256-OLD...
            got:    sha256-NEW...
```

it replaces `OLD` with `NEW` in the appropriate `lock.nix`, and retries the build.

```bash
nix run .#lock-nix-tidy              # every package
nix run .#lock-nix-tidy -- <attr>    # just one
```

It discovers each package's fetchers, re-fetches them with `nix build --rebuild` — the only check a stale hash can't fake — and rewrites `specified:` → `got:` into every `lock.nix` carrying the stale hash. Hashes are only ever written from real build failures, so a no-diff run means everything is current. Only fetchers build (~10–14 s each, ≈ 1 min full sweep).

Caveats:

* Always run it as `nix run .#lock-nix-tidy` — the wrapper pins vanilla Nix (≥ 2.28). Determinate answers `flake show --json` with a different schema and breaks enumeration (the tool says so).
* Coverage needs no registration: derivations must read hashes **from** `lock.nix`, and every fetcher to cover must be a **direct** input of an exposed package.
* Nothing is committed; review the diffs and commit yourself.
