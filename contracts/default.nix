{
  pkgs,
  rev,
  oplint,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};

  package-info = builtins.fromJSON (builtins.readFile ./package.json);

  # source yarn.lock at the root of the repo
  yarnLock = ../yarn.lock;

  acton = pkgs.callPackage ./acton.nix {inherit pkgs;};

  # Wraps a repo-local ts-node script (under scripts/) as a nix app/devShell command.
  #
  # These run via `node --require ts-node/register/transpile-only`, which resolves
  # `ts-node` itself, and any of the script's own relative imports (e.g.
  # scripts/acton/toml.ts), against real, yarn-installed node_modules on disk -- not
  # anything embedded in the nix store. ts-node also looks up tsconfig.json relative
  # to the process cwd, not the script's location. So, unlike a typical
  # writeShellApplication, this locates the real on-disk script and cd's there before
  # running it, instead of embedding a `${./scripts/<name>.ts}` store path.
  mkTsScriptApp = {
    name,
    scriptPath,
  }:
    pkgs.writeShellApplication {
      inherit name;
      runtimeInputs = [
        acton
        pkgs.nodejs_24
      ];
      text = ''
        root="$PWD"
        if [ ! -f "$root/Acton.toml" ] && [ -f "$root/contracts/Acton.toml" ]; then
          root="$root/contracts"
        fi
        if [ ! -f "$root/${scriptPath}" ]; then
          echo "error: could not find ${scriptPath} under $root (run from the contracts directory, repo root, or set your cwd there)" >&2
          exit 1
        fi

        # Resolve any path arguments (e.g. a manifest or ABI JSON file) before
        # changing directories below, so they stay correct relative to the caller's
        # cwd. Leave anything that isn't an existing path (e.g. a --flag) untouched,
        # so realpath doesn't fail on it and abort the script under set -e.
        args=()
        for arg in "$@"; do
          if [ -e "$arg" ]; then
            args+=("$(realpath "$arg")")
          else
            args+=("$arg")
          fi
        done

        # repo root has no tsconfig.json, which would otherwise make ts-node fall
        # back to its bundled default config and fail with TS5109 on this
        # TypeScript version -- cd into $root so it finds the real one.
        cd "$root"
        exec node --require ts-node/register/transpile-only ${scriptPath} "''${args[@]}"
      '';
    };

  # Builds a package from a published contracts release tarball (GH release
  # `contracts/<version>`), with artifacts at the root of the package. The
  # tarball hash is pinned in lock.nix under `contracts-<version with _ for .>`
  # (e.g. contracts-1_6_2).
  mkContractsRelease = version: let
    lockKey = "contracts-" + builtins.replaceStrings ["."] ["_"] version;
  in
    pkgs.stdenv.mkDerivation (finalAttrs: {
      pname = "chainlink-contracts-ton";
      inherit version;

      src = pkgs.fetchurl {
        url = "https://github.com/smartcontractkit/chainlink-ton/releases/download/contracts/${version}/contracts-${version}.tar.gz";
        hash =
          lock.${lockKey}
          or (throw "contracts: missing lock.${lockKey} hash for version ${version}");
      };
      sourceRoot = "."; # pin source root to avoid issues with unpacker (produced multiple directories)

      skipBuild = true;
      installPhase = ''
        mkdir -p $out
        cp -r * $out/
      '';

      meta = with pkgs.lib; {
        description = "Chainlink TON smart contracts";

        # TODO: update to MIT after March 12, 2029 as per LICENSE file
        license = licenses.bsl11;

        # TODO: update to contracts project-specific tag
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${finalAttrs.version}";
      };
    });

  packages = rec {
    # Official TON Jetton contract in FunC
    contracts-jetton-func = pkgs.buildNpmPackage (finalAttrs: rec {
      pname = "contracts-jetton-func";

      src = fetchGit {
        url = "https://github.com/ton-blockchain/jetton-contract.git";
        rev = "3d24b419f2ce49c09abf6b8703998187fe358ec9"; # jetton-1.2, Jun 7, 2025
      };
      version = (builtins.fromJSON (builtins.readFile "${src}/package.json")).version;

      npmDepsHash = lock.contracts-jetton;

      meta = with pkgs.lib; {
        description = "Reference implementation of Jetton (fungible token) smart contract for TON.";
        license = licenses.mit;
        changelog = "https://github.com/ton-blockchain/jetton-contract/releases/tag/jetton-1.2";
      };
    });

    inherit acton;

    abigen = mkTsScriptApp {
      name = "abigen";
      scriptPath = "scripts/abigen.ts";
    };

    overflow-check = mkTsScriptApp {
      name = "overflow-check";
      scriptPath = "scripts/overflowCheck.ts";
    };

    # Chainlink contract pkgs
    contracts = pkgs.stdenv.mkDerivation (finalAttrs: {
      inherit (package-info) version;
      pname = "chainlink-contracts-ton";
      src = ./.;

      yarnOfflineCache = pkgs.fetchYarnDeps {
        inherit yarnLock;
        # pin the vendor hash
        hash = lock.contracts;
      };

      # postPatch script to copy root yarn.lock to the current build directory (and make it writeable)
      postPatch = ''
        cp ${yarnLock} ./yarn.lock
        chmod u+w ./yarn.lock
      '';

      nativeBuildInputs = with pkgs;
        [
          yarnConfigHook
          yarnBuildHook
          yarnInstallHook
          # Needed for executing package.json scripts
          nodejs_24
        ]
        ++ [acton];

      buildInputs = [
        contracts-jetton-func
      ];

      PATH_CONTRACTS_JETTON = "${contracts-jetton-func}/lib/node_modules/jetton/build/";
      # The nix build sandbox has no network access; skip acton's automatic
      # bundled-stdlib refresh so `acton build` doesn't try to reach the network.
      ACTON_DISABLE_AUTO_STDLIB = "1";

      meta = with pkgs.lib; {
        inherit (package-info) description;

        # TODO: update to MIT after March 12, 2029 as per LICENSE file
        license = licenses.bsl11;

        # TODO: update to contracts project-specific tag
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
      };
    });

    # Previous releases, fetched from the published GH release tarballs. Each
    # version's hash is pinned in lock.nix (see contracts-1_6_* keys).
    contracts_1_6 = mkContractsRelease "1.6.0";
    contracts_1_6_1 = mkContractsRelease "1.6.1";
    contracts_1_6_2 = mkContractsRelease "1.6.2";
    contracts_1_6_3 = mkContractsRelease "1.6.3";
  };
in {
  # Output a set of specifc shells
  devShells = {
    contracts = pkgs.callPackage ./shell.nix {
      inherit pkgs;
      contracts_1_6 = packages.contracts_1_6;
      contracts_1_6_1 = packages.contracts_1_6_1;
      contracts_1_6_2 = packages.contracts_1_6_2;
      contracts_1_6_3 = packages.contracts_1_6_3;
      jetton-contracts = packages.contracts-jetton-func;
      acton = packages.acton;
      abigen = packages.abigen;
      inherit oplint;
    };
  };

  # Output a set of specifc packages
  inherit packages;
}
