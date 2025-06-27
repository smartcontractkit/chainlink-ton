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
        hash = "sha256-Bqfzxa4YgogbK4CSCQUhjd+kJqig/d+B4hneekFmAZA=";
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
  };
}
