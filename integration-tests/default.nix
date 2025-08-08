{
  pkgs,
  rev,
}: let
  # Import contracts to get jetton-contracts
  contracts = pkgs.callPackage ../contracts {inherit pkgs rev;};
  # Import chainlink-ton package
  chainlink-ton = pkgs.callPackage ../cmd/chainlink-ton {inherit pkgs rev;};
in {
  devShells = {
    ccip-e2e = pkgs.callPackage ./shell-ccip-e2e.nix {
      inherit pkgs;
      chainlink-ton = chainlink-ton;
      jetton-contracts = contracts.packages.contracts-jetton-func;
    };
    # Note: other integration test environments could go here
  };

  # integration-test related packages including test utilities, custom test runners, etc.
  packages = {};
}
