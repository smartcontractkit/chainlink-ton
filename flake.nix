{
  description = "Chainlink TON - a repository of Chainlink integration components to support TON";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = inputs @ {
    self,
    nixpkgs,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      # Import nixpkgs with specific configuration
      pkgs = import nixpkgs {
        inherit system;
      };

      # The rev (git commit hash) of the current flake
      rev = self.rev or self.dirtyRev or "-";

      # The common arguments to pass to the packages
      commonArgs = {
        inherit pkgs;
        inherit rev;
      };

      # Resolve subprojects
      chainlink-ton = pkgs.callPackage ./default.nix commonArgs;
      #   contracts = pkgs.callPackage ./contracts commonArgs;
    in rec {
      # Output a set of dev environments (shells)
      devShells = {
        default = pkgs.callPackage ./shell.nix {inherit pkgs;};
      };

      # Output a set of packages (e.g., CL core node plugins, sc artifacts, etc.)
      packages = {
        # Chainlink core node plugin (default + alias)
        inherit chainlink-ton;
        default = chainlink-ton;
      };
    });
}
