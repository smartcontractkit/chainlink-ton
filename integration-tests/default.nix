{
  pkgs,
  rev,
}:
let
  # Any integration-test specific configuration
in
{
  devShells = {
    ccip-e2e = pkgs.callPackage ./shell-ccip-e2e.nix { inherit pkgs; };
    # Note: other integration test environments could go here
  };

  # integration-test related packages including test utilities, custom test runners, etc.
  packages = {};
}
