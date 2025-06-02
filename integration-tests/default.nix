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

  # any integration-test related packages
  packages = {
    # Could include test utilities, custom test runners, etc.
  };
}
