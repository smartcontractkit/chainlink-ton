{
  description = "Chainlink TON - a repository of Chainlink integration components to support TON";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
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

      # Resolve root module
      chainlink-ton = pkgs.callPackage ./cmd/chainlink-ton commonArgs;
      # Resolve sub-modules
      contracts = pkgs.callPackage ./contracts commonArgs;
      # Resolve tools
      dependency-analyzer = pkgs.callPackage ./tools/dependency_analyzer commonArgs;
    in rec {
      # Output a set of dev environments (shells)
      devShells =
        {
          default = pkgs.callPackage ./shell.nix {inherit pkgs;};
          # Development shell for dependency analyzer
          dependency-analyzer = pkgs.callPackage ./tools/dependency_analyzer/shell.nix {inherit pkgs;};
          # Development shell for running the CCIP E2E tests
          e2e = pkgs.callPackage ./e2e-shell.nix {inherit pkgs;};
        }
        // contracts.devShells;

      # Output a set of packages (e.g., CL core node plugins, sc artifacts, etc.)
      packages =
        {
          # Chainlink core node plugin (default + alias)
          inherit chainlink-ton;
          default = chainlink-ton;
          # Dependency analyzer
          dependency-analyzer = dependency-analyzer.packages.default;
        }
        // contracts.packages;
    });
}
