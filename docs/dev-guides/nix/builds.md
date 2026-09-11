---
id: dev-guides-nix-builds
title: Builds
sidebar_label: Builds
sidebar_position: 2
---

# Builds - Nix

## Building packages

This repository defines a set of outputs we call packages for which build derivations are expressed using Nix.

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

Nix aims for deterministic (reproducible) builds. A key part of this is **fixed-output derivations (FODs)** such as `fetchurl`, `buildGoModule`’s vendor step, `fetchgit`, etc. For any FOD, Nix requires a **content hash** up front. After the build/fetch runs, Nix verifies that the resulting output’s hash exactly matches what was declared; if it doesn’t, the build fails with a “hash mismatch in fixed-output derivation” error. This protects you from drifting dependencies and ensures that CI and local builds use the exact same inputs.

### Why vendor hashes need to be pinned

Language ecosystems resolve and download a lot of upstream content (Go modules, npm/yarn, cargo crates, vendored tarballs…). To make those fetches deterministic, Nix needs the **expected content hash**. For example, with `buildGoModule`, you must set `vendorHash` so Nix knows what the fully-resolved module tree should hash to. If you bump a version or change dependencies, the **content changes** and the old hash becomes invalid—Nix will (correctly) refuse the build until you update the pinned hash.

### Organizing hashes in `lock.nix`

To make hash maintenance easy and reviewable, we keep all pinned hashes in small `lock.nix` files (one per package directory or per group of packages). Packages then **import** from these files rather than inlining hashes in the derivation:

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

For each package it discovers the fetchers (the fixed-output derivations the package directly needs), re-fetches each with `nix build --rebuild` — the only check a stale hash can't fake — and on a mismatch rewrites `specified:` → `got:` into every `lock.nix` carrying it. Hashes are only ever written from a real build failure, so a run that changes nothing means every pinned hash is current. Only fetchers build; packages are never compiled (~10–14 s each, ≈ 1 minute full sweep).

Caveats:

* Always run it as `nix run .#lock-nix-tidy` — the wrapper pins vanilla Nix (≥ 2.28). Determinate Nix answers `flake show --json` with a different schema and breaks enumeration (the tool says so when it sees that).
* Derivations must read hashes **from** `lock.nix` (as above), and every fetcher you want covered must be a **direct** input of an exposed package. A new fetcher is covered automatically once referenced — no registration step.
* Nothing is committed; review the diffs and commit yourself.
