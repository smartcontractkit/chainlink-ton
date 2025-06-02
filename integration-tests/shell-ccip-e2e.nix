{
  stdenv,
  pkgs,
  lib,
}:

let
  # import the default shell to reuse its buildInputs
  defaultShellBuildInputs = (import ../shell.nix { inherit stdenv pkgs lib; }).buildInputs;
in
pkgs.mkShell {
  name = "chainlink-ton-ccip-e2e-shell";

  buildInputs = defaultShellBuildInputs ++ (with pkgs; [
    docker
    postgresql
    coreutils
  ]);

  shellHook = ''
    export PG_CONTAINER_NAME=cl_pg
    export PG_PORT=5432
    export PG_USER=postgres
    export PG_PASSWORD=postgres
    export PG_DB=chainlink_test
    export CL_DATABASE_URL="postgresql://''${PG_USER}:''${PG_PASSWORD}@localhost:''${PG_PORT}/''${PG_DB}?sslmode=disable"

    echo ""
    echo "Welcome to Chainlink TON CCIP E2E shell."
    echo "----------------------------------------------------"
    echo "To set up the E2E environment (Test DB, Chainlink Core):"
    echo "  ./scripts/e2e/setup-env.sh"
    echo ""
    echo "Then, to run your E2E tests:"
    echo "  CL_DATABASE_URL is already set in this shell environment."
    echo "  ./scripts/e2e/run-test.sh --test-command \"YOUR_TEST_COMMAND_HERE\""
    echo ""
  '';
}
