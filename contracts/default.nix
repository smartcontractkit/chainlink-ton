{
  pkgs,
  rev,
}: let
  # The common arguments to pass to the packages
  commonArgs = {
    inherit pkgs;
    inherit rev;
  };

  package-info = builtins.fromJSON (builtins.readFile ./package.json);
in {
  description = "Chainlink TON - smart contracts module";

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
        yarnLock = finalAttrs.src + "/yarn.lock";
        # pin the vendor hash (update using 'pkgs.lib.fakeHash')
        hash = "sha256-jpmr/Dke32UJmdCLYlpJAc4rxkARd2n5vDG52D3pVVw=";
      };

      nativeBuildInputs = with pkgs; [
        yarnConfigHook
        yarnBuildHook
        yarnInstallHook
        # Needed for executing package.json scripts
        nodejs_23
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
