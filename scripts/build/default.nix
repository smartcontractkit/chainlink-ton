{
  pkgs,
  rev,
  chainlink-ton,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};

  # Function to build a Go plugin given its build-info
  buildGoPlugin = pkgs.callPackage ./lib/build-go-plugin.nix {
    inherit pkgs;
    inherit lock;
  };

  build-info = {
    solana = rec {
      pname = "chainlink-solana";
      url = "https://github.com/smartcontractkit/chainlink-solana";
      rev = "fa42dad2d413c116560ada2923dd122ff2812cd5";

      src = builtins.fetchGit {
        inherit rev;
        inherit url;
      };

      subPackages = ["pkg/solana/cmd/chainlink-solana"];

      package-info = {
        version = "1.0.0";
        description = "Chainlink Solana LOOP plugin";
      }; # we don't have a package.json here, how to fetch version and description?
    };

    aptos = rec {
      pname = "chainlink-aptos";
      url = "https://github.com/smartcontractkit/chainlink-aptos";
      rev = "ad2cb3166a0d377b7ade9a9bd71f4c1a4eb4ac3f";

      src = builtins.fetchGit {
        inherit rev;
        inherit url;
      };

      subPackages = ["cmd/chainlink-aptos"];

      package-info = {
        version = "1.0.0";
        description = "Chainlink Aptos LOOP plugin";
      }; # we don't have a package.json here, how to fetch version and description?
    };
  };
in {
  packages = rec {
    chainlink-solana = buildGoPlugin build-info.solana;
    chainlink-aptos = buildGoPlugin build-info.aptos;

    chainlink-plugins-bundle = pkgs.symlinkJoin {
      name = "chainlink-plugins-bundle";
      paths = [
        chainlink-ton
        chainlink-solana
        chainlink-aptos
      ];
      # Make sure the output path is deterministic
      # (otherwise, it would include the hash of the input paths)
      dontPatchELF = true;
      dontStrip = true;
    };
  };
}
