{
  pkgs,
  rev,
}: let
  # The common arguments to pass to the packages
  commonArgs = {
    inherit pkgs;
    inherit rev;
  };

  # Resolve subprojects
  contracts = pkgs.callPackage ./contracts commonArgs;
  relayer = pkgs.callPackage ./relayer commonArgs;
in {
  description = "Chainlink Aptos - Chainlink integration for the Aptos blockchain";

  devShells = {
    aptos = pkgs.callPackage ./shell.nix {inherit pkgs;};
  };

  # Output a set of Aptos specifc packages
  packages = {
    # Chainlink core node plugins
    # Notice: subproject just exposes the relayer package (single)
    chainlink-aptos = relayer;

    # Chainlink contract pkgs
    # Notice: subproject exposes multiple packages, which we re-export here
    chainlink-contracts-aptos = contracts.packages.default;
    # Chainlink contract pkgs - build script
    chainlink-contracts-aptos-build = contracts.packages.build-script;
  };
}
