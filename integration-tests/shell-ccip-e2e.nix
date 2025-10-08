{
  stdenv,
  pkgs,
  lib,
  # Local dependencies
  chainlink-ton,
  jetton-contracts,
}: let
  # import the default shell to reuse its buildInputs
  # TODO: this is not importing but resolving. We could compose the shells better to avoid duplicated callPackage calls.
  defaultShellBuildInputs =
    (pkgs.callPackage ../shell.nix {
      inherit stdenv pkgs lib;
    })
    .buildInputs;
in
  pkgs.mkShell {
    name = "chainlink-ton-ccip-e2e-shell";

    buildInputs =
      defaultShellBuildInputs
      ++ (with pkgs; [
        docker
        postgresql
        coreutils
      ])
      ++ [
        chainlink-ton
        jetton-contracts
      ];

    PATH_CONTRACTS_JETTON = "${jetton-contracts}/lib/node_modules/jetton/build/";

    shellHook = ''
      export PG_CONTAINER_NAME=cl_pg
      export PG_PORT=5432
      export PG_USER=postgres
      export PG_PASSWORD=postgres
      export PG_DB=chainlink_test
      export CL_DATABASE_URL="postgresql://''${PG_USER}:''${PG_PASSWORD}@127.0.0.1:''${PG_PORT}/''${PG_DB}?sslmode=disable"

      alias setup-e2e="./scripts/e2e/setup-env.sh"
      alias run-e2e="./scripts/e2e/run-test.sh"

      echo ""
      echo "Welcome to Chainlink TON CCIP E2E shell."
      echo "----------------------------------------------------"
      echo "Quick commands:"
      echo "  setup-e2e [--core-dir /path/to/chainlink_core]                     # Set up the E2E environment"
      echo "  run-e2e [--core-dir /path/to/chainlink_core] --test-command \"..\" # Run E2E tests"
      echo ""
      echo "Example workflow:"
      echo "  setup-e2e"
      echo "  run-e2e --test-command \"cd integration-tests/smoke/ccip && go test ccip_ton_..."
      echo ""
    '';
  }
