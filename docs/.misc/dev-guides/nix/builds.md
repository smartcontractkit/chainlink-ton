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

We provide a small utility **lock-nix-tidy** that builds packages and automatically updates `lock.nix` when it encounters a fixed-output hash mismatch:

#### What it does

* Recursively finds `./**/lock.nix`.
* Builds your package(s) and streams live Nix logs.
* On an error like:

  ```bash
  error: hash mismatch in fixed-output derivation
           specified: sha256-OLD...
              got:    sha256-NEW...
  ```

  it replaces `OLD` with `NEW` in the appropriate `lock.nix`, and retries the build.

#### How to use it

* Build & tidy **all** packages for the current system:

  ```bash
  nix run .#lock-nix-tidy
  ```

* Build & tidy **one** package:

  ```bash
  nix run .#lock-nix-tidy -- <pkg-attr>
  ```

#### Requirements & caveats

* Your derivations must read hashes **from** `lock.nix` (as shown above). If a mismatched hash isn’t found in any `lock.nix`, the tool will say so and leave the error intact.
* The tool does not commit changes. After a successful run, review diffs and commit
* If you introduce new fixed-output fetchers, remember to add their hashes to the relevant `lock.nix` and reference them from the derivation.

With this setup, your builds remain deterministic, and routine “hash mismatch” churn is handled by a single, repeatable command.
