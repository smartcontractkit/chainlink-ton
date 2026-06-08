{
  pkgs,
  rev,
  oplint,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};

  package-info = builtins.fromJSON (builtins.readFile ./package.json);

  # source yarn.lock at the root of the repo
  yarnLock = ../yarn.lock;

  packages = rec {
    # Official TON Jetton contract in FunC
    contracts-jetton-func = pkgs.buildNpmPackage (finalAttrs: rec {
      pname = "contracts-jetton-func";

      src = builtins.fetchGit {
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

    acton = pkgs.callPackage ./acton.nix {inherit pkgs;};

    abigen = pkgs.writeShellApplication {
      name = "abigen";
      runtimeInputs = [
        acton
        pkgs.python3
      ];
      text = ''
        exec python3 ${./scripts/abigen.py} "$@"
      '';
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

      nativeBuildInputs = with pkgs; [
        yarnConfigHook
        yarnBuildHook
        yarnInstallHook
        # Needed for executing package.json scripts
        nodejs_24
      ];

      buildInputs = [
        contracts-jetton-func
      ];

      meta = with pkgs.lib; {
        inherit (package-info) description;

        # TODO: update to MIT after March 12, 2029 as per LICENSE file
        license = licenses.bsl11;

        # TODO: update to contracts project-specific tag
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
      };
    });

    # Previous releases
    contracts_1_6 = pkgs.stdenv.mkDerivation (finalAttrs: rec {
      pname = "chainlink-contracts-ton";

      src = builtins.fetchurl {
        url = "https://github.com/smartcontractkit/chainlink-ton/releases/download/contracts/${finalAttrs.version}/contracts-${finalAttrs.version}.tar.gz";
        sha256 = "sha256:14rv1v99sqjk0cnbxkyj4q0syb7v1m4bp6x4n0gprpkss1b8w1k5";
      };
      version = "1.6.0";
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
    contracts_1_6_1 = pkgs.stdenv.mkDerivation (finalAttrs: rec {
      pname = "chainlink-contracts-ton";

      src = builtins.fetchurl {
        url = "https://github.com/smartcontractkit/chainlink-ton/releases/download/contracts/${finalAttrs.version}/contracts-${finalAttrs.version}.tar.gz";
        sha256 = "sha256:0j9f7pxqamqj1p3zrfa9kggx15j80p5whv514w2wi1dp5zhmpfs1";
      };
      version = "1.6.1";
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
    contracts_1_6_2 = pkgs.stdenv.mkDerivation (finalAttrs: rec {
      pname = "chainlink-contracts-ton";

      src = builtins.fetchurl {
        url = "https://github.com/smartcontractkit/chainlink-ton/releases/download/contracts/${finalAttrs.version}/contracts-${finalAttrs.version}.tar.gz";
        sha256 = "sha256:1gbvagivlzf0jwrshhq903ijrfxwqssbd255asjfi81924cyvayl";
      };
      version = "1.6.2";
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
  };
in {
  # Output a set of specifc shells
  devShells = {
    contracts = pkgs.callPackage ./shell.nix {
      inherit pkgs;
      contracts_1_6 = packages.contracts_1_6;
      contracts_1_6_1 = packages.contracts_1_6_1;
      contracts_1_6_2 = packages.contracts_1_6_2;
      jetton-contracts = packages.contracts-jetton-func;
      acton = packages.acton;
      abigen = packages.abigen;
      inherit oplint;
    };
  };

  # Output a set of specifc packages
  inherit packages;
}
