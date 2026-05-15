{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
  package-info = builtins.fromJSON (builtins.readFile ../../pkg/package.json);
  go_1_26_2 = pkgs.go_1_26.overrideAttrs (_old: rec {
    version = "1.26.2";
    src = pkgs.fetchurl {
      url = "https://go.dev/dl/go${version}.src.tar.gz";
      hash = "sha256-LpHrtpR6lulDb7KzkmqIAu/mOm03Xf/sT4Kqnb1v1Ds=";
    };
  });
in
  pkgs.buildGo126Module.override {go = go_1_26_2;} rec {
    inherit (package-info) version;
    pname = "chainlink-ton";

    # source at the root of the module
    src = ./../..;
    subPackages = ["cmd/chainlink-ton"];

    ldflags = [
      "-X main.Version=${package-info.version}"
      "-X main.GitCommit=${rev}"
    ];

    # pin the vendor hash (update using 'pkgs.lib.fakeHash')
    vendorHash = lock.chainlink-ton;

    # postInstall script to write version and rev to share folder
    postInstall = ''
      mkdir $out/share
      echo ${package-info.version} > $out/share/.version
      echo ${rev} > $out/share/.rev
    '';

    meta = with pkgs.lib; {
      inherit (package-info) description;
      license = licenses.mit;
      changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
    };
  }
