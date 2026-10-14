{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
in
  pkgs.buildGo127Module rec {
    pname = "lint-tolk-min-value";
    version = "1.0.0";

    # source at the root of the module (shares go.mod/go.sum with the other Go tools)
    src = ./../..;
    subPackages = ["scripts/lint-tolk-min-value"];

    # pin the vendor hash (same module deps as oplint; update using 'pkgs.lib.fakeHash')
    vendorHash = lock.minlint;
    proxyVendor = true;

    meta = with pkgs.lib; {
      description = "Linter requiring every CCIP/MCMS incoming message to carry a min-value check";
      license = licenses.mit;
    };
  }
