{
  pkgs,
  rev,
  # Local dependencies
  chainlink-ton,
  jetton-contracts,
}: let
in {
  devShells = {
    ccip-e2e = pkgs.callPackage ./shell-ccip-e2e.nix {
      inherit pkgs;
      inherit chainlink-ton;
      inherit jetton-contracts;
    };
    # Note: other integration test environments could go here
  };

  # integration-test related packages including test utilities, custom test runners, etc.
  packages = {};
}
