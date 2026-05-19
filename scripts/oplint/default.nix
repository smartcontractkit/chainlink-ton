{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
  go_1_26_2 = pkgs.go_1_26.overrideAttrs (_old: rec {
    version = "1.26.2";
    src = pkgs.fetchurl {
      url = "https://go.dev/dl/go${version}.src.tar.gz";
      hash = "sha256-LpHrtpR6lulDb7KzkmqIAu/mOm03Xf/sT4Kqnb1v1Ds=";
    };
  });
in
  pkgs.buildGo126Module.override {go = go_1_26_2;} rec {
    pname = "oplint";
    version = "1.0.0";

    # source at the root of the module
    src = ./../..;
    subPackages = ["scripts/oplint"];

    # pin the vendor hash (update using 'pkgs.lib.fakeHash')
    vendorHash = lock.oplint;

    meta = with pkgs.lib; {
      description = "Tool to validate that struct opcodes in .tolk files match the CRC32 checksum of their struct names";
      license = licenses.mit;
    };
  }
