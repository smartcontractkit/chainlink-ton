{
  pkgs,
  rev,
}: let
  # The common arguments to pass to the packages
  commonArgs = {
    inherit pkgs;
    inherit rev;
  };
in {
  description = "Chainlink TON - smart contracts module";

  # Output a set of specifc shells
  devShells = {
    contracts = pkgs.callPackage ./shell.nix {inherit pkgs;};
  };

  # Output a set of specifc packages
  packages = {
    # Chainlink contract pkgs
    contracts = "TODO - contracts derivation (pkg which outputs artifacts)";
  };
}
