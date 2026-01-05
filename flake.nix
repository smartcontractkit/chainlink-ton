{
  description = "Chainlink TON - a repository of Chainlink integration components to support TON";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    # (backport) move back to nixpkgs/nixos-unstable once go1.25.3 is available
    # https://github.com/NixOS/nixpkgs/pull/451815
    nixpkgs-release-25-05.url = "github:NixOS/nixpkgs/release-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = inputs @ {
    self,
    nixpkgs,
    nixpkgs-release-25-05,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      # Import nixpkgs with specific configuration
      pkgsUnstable = import nixpkgs {inherit system;};
      pkgsBackport = import nixpkgs-release-25-05 {inherit system;};

      # Replace selected Go packages with latest from backport release (go1.25.3 support)
      pkgs =
        pkgsUnstable
        // {
          go_1_25 = pkgsBackport.go_1_25;
          buildGo125Module = pkgsBackport.buildGo125Module;
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
      chainlink-ton-extras = pkgs.callPackage ./cmd/chainlink-ton-extras commonArgs;
      # Resolve tools
      dependency-analyzer = pkgs.callPackage ./tools/dependency_analyzer commonArgs;
      oplint = pkgs.callPackage ./scripts/oplint commonArgs;
      # Resolve sub-modules
      contracts = pkgs.callPackage ./contracts {
        inherit pkgs;
        inherit rev;
        inherit oplint;
      };
      integration-tests = pkgs.callPackage ./integration-tests {
        inherit pkgs;
        inherit rev;
        inherit chainlink-ton;
        # TODO: why the pkg rename here?
        jetton-contracts = contracts.packages.contracts-jetton-func;
      };

      # Nix devex
      lock-nix-tidy = pkgs.writeShellApplication {
        name = "lock-nix-tidy";
        runtimeInputs = [
          pkgs.nix
          pkgs.jq
          pkgs.coreutils
          pkgs.findutils
          pkgs.gnugrep
          pkgs.gawk
          pkgs.gnused
        ];
        text = builtins.readFile ./scripts/lock-nix-tidy.sh;
      };
    in rec {
      # Output a set of dev environments (shells)
      devShells =
        {
          default = pkgs.callPackage ./shell.nix {inherit pkgs;};
          # Development shell for dependency analyzer
          dependency-analyzer = pkgs.callPackage ./tools/dependency_analyzer/shell.nix {inherit pkgs;};
        }
        // contracts.devShells
        // integration-tests.devShells;

      # Output a set of packages (e.g., CL core node plugins, sc artifacts, etc.)
      packages =
        {
          # Chainlink core node plugin (default + alias)
          inherit chainlink-ton;
          inherit chainlink-ton-extras;
          default = chainlink-ton;
          # Dependency analyzer
          dependency-analyzer = dependency-analyzer.packages.default;
          # Validate struct opcodes
          inherit oplint;

          inherit lock-nix-tidy;
        }
        // contracts.packages;
    });
}
