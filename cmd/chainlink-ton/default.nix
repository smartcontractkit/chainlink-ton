{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};

  # Function to build a Go plugin given its build-info
  buildGoPlugin = pkgs.callPackage ../../scripts/build/lib/build-go-plugin.nix {
    inherit pkgs;
    inherit lock;
  };

  build-info = {
    ton = rec {
      pname = "chainlink-ton";
      repo = {
        inherit rev;
        url = "https://github.com/smartcontractkit/chainlink-ton";
      };

      # source at the root of the module
      src = ./../..;
      subPackages = ["cmd/chainlink-ton"];

      package-info = builtins.fromJSON (builtins.readFile ../../pkg/package.json);
    };
  };
in
  buildGoPlugin build-info.ton
