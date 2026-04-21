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
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = pkg:
          builtins.elem (nixpkgs.lib.getName pkg) [
            "chainlink-contracts-ton" # BUSL-1.1 license
          ];
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
      oplint = (pkgs.callPackage ./scripts/oplint commonArgs).overrideAttrs (_old: {
        env.GOFLAGS = "-mod=mod -trimpath";
      });

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
