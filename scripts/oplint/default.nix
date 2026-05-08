{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
in
  pkgs.buildGo126Module rec {
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
