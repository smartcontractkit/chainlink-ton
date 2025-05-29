{
  stdenv,
  pkgs,
  lib,
}:

let
  # import the default shell to reuse its buildInputs
  defaultShellBuildInputs = (import ./shell.nix { inherit stdenv pkgs lib; }).buildInputs;
in
pkgs.mkShell {
  name = "chainlink-ton-ccip-e2e-shell";

  buildInputs = defaultShellBuildInputs ++ (with pkgs; [
    docker
    postgresql
    coreutils
  ]);

  shellHook = ''
    echo ""
    echo "Chainlink TON CCIP E2E shell."
    echo "----------------------------------------------------"
    echo "This shell includes tools from the default shell, plus:"
    echo "  - Docker, PostgreSQL, Coreutils (for container management)"
    echo ""
    echo "To set up the E2E environment (Test DB, Chainlink Core):"
    echo "  ./scripts/e2e/setup-env.sh"
    echo ""
    echo "After setup, ensure CL_DATABASE_URL is set in your environment."
    echo "The setup script will print the required export command, typically:"
    echo "  export CL_DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable\""
    echo ""
    echo "Then, to run your E2E tests:"
    echo "  ./scripts/e2e/run-test.sh --test-command \"YOUR_TEST_COMMAND_HERE\""
    echo ""
  '';
}
