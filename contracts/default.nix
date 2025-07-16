{
  pkgs,
  rev,
}: let
  package-info = builtins.fromJSON (builtins.readFile ./package.json);

  # source yarn.lock at the root of the repo
  yarnLock = ../yarn.lock;
in {
  # Output a set of specifc shells
  devShells = {
    contracts = pkgs.callPackage ./shell.nix {inherit pkgs;};
  };

  # Output a set of specifc packages
  packages = {
    # Chainlink contract pkgs
    contracts = pkgs.stdenv.mkDerivation (finalAttrs: {
      inherit (package-info) version;
      pname = "chainlink-contracts-ton";
      src = ./.;

      yarnOfflineCache = pkgs.fetchYarnDeps {
        inherit yarnLock;
        # pin the vendor hash (update using 'pkgs.lib.fakeHash')
        hash = "sha256-5iXs08myWbcfhrAA4KcDrPAybuQZSHqp8h6uV+b3BfI=";
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

      meta = with pkgs.lib; {
        inherit (package-info) description;
        license = licenses.mit;
        # TODO: update to contracts project-specific tag
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
      };
    });

    # Official TON Jetton contract in FunC
    contracts-jetton-func = pkgs.buildNpmPackage (finalAttrs: rec {
      pname = "contracts-jetton-func";

      src = pkgs.fetchgit {
        url = "https://github.com/ton-blockchain/jetton-contract.git";
        rev = "3d24b419f2ce49c09abf6b8703998187fe358ec9"; # jetton-1.2, Jun 7, 2025
        hash = "sha256-jel0z/DsndlpnWuUhm4vzoacM/zboLCIqcPmPqBsDgU=";
      };
      version = (builtins.fromJSON (builtins.readFile "${src}/package.json")).version;

      npmDepsHash = "sha256-EZtvTf19MjSKTWNir6pcP9XHwUIpE4ILSlhS+cQD/7w=";

      meta = with pkgs.lib; {
        description = "Reference implementation of Jetton (fungible token) smart contract for TON.";
        license = licenses.mit;
        changelog = "https://github.com/ton-blockchain/jetton-contract/releases/tag/jetton-1.2";
      };
    });
  };
}