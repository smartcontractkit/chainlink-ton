# Chainlink-TON End-to-End Testing Setup

This guide details the setup and execution of CCIP integration tests within the `chainlink-ton` repository. These tests are crucial for verifying the correct integration of `chainlink-ton` with a specific version of `chainlink` core.

## 1. Overview

The primary goals of this End-to-End (E2E) testing setup are:

* **Consistent Environments:** Ensure identical testing setups for both local development and CI pipelines.
* **Rapid Iteration:** Facilitate quick verification of `chainlink-ton` changes against the `chainlink` core.
* **Version Control:** Establish the `.core_version` file as the definitive source for the `chainlink` core version used in testing.

The process involves two main scripts:

1. `scripts/e2e/setup-env.sh`: Prepares the testing environment, including database setup and Chainlink core configuration.
2. `scripts/e2e/run-test.sh`: Executes the specified tests within the prepared environment.

## 2. Prerequisites

To run E2E tests locally, you will need:

* **Docker:** Essential for running PostgreSQL (managed by `setup-env.sh`).
* **Chainlink Repository:** A local clone of `smartcontractkit/chainlink`.
* **Go:** Required for building Chainlink and running tests.
* **Standard Unix Utilities:** `git`, `realpath`, `tr`, `pg_isready`.
* **Nix (Recommended):** Provides a consistent development environment (devShells.e2e) with all other necessary dependencies (Go, standard Unix utilities like git, realpath, tr, pg_isready, Docker CLI) pre-configured. Using the Nix shell is the recommended way to ensure your local setup mirrors the CI environment.

## 3. Setup

Follow these steps to set up your E2E testing environment:

### 3.0. Using the Nix E2E Shell (Recommended)

1. Enter the Shell: Navigate to the root of the chainlink-ton repository and run:

```bash
  nix develop .#ccip-e2e
```

This command activates the E2E development shell, which provides all necessary tools and sets up some environment variables (like default PostgreSQL connection parameters and `CL_DATABASE_URL`). Your command prompt will likely change to indicate you are in the Nix shell.

2. Proceed with Setup: Once inside the Nix shell, continue with the steps below (3.1, 3.2, 3.3). The `scripts/e2e/setup-env.sh` script will respect the environment variables set by the Nix shell (e.g., for database configuration) or use its internal defaults if run standalone.

### 3.1. Clone Chainlink Core

Clone the `smartcontractkit/chainlink` repository. By default, the scripts expect it in `../chainlink` (relative to the `chainlink-ton` root), but you can specify a different path using the `-c` or `--core-dir` argument for both `setup-env.sh` and `run-test.sh`.

```bash
git clone https://github.com/smartcontractkit/chainlink.git ../chainlink
```

### 3.2. `.core_version` File

The `scripts/.core_version` file within this repository specifies the chainlink Git reference to be used for tests. The `setup-env.sh` script (and `run-test.sh` for verification) automatically ensures your local chainlink checkout matches this specified version. If it doesn't match, `setup-env.sh` will instruct you to check out the correct version.

**Version Control**: Establish the `.core_version` file as the definitive source for the chainlink core version used in testing.

* [ ] `TODO`: Align this `.core_version` Git reference with the Chainlink version tag used for the BASE_IMAGE (e.g., `public.ecr.aws/chainlink/chainlink:vX.Y.Z-plugins`) in Docker build scripts like `scripts/build/build-image.sh`. This synchronization will ensure consistency between source-based integration tests and the plugin's runtime environment within the Docker image, removing discrepancies that could arise from using two different core dependency sources/versions.

### 3.3. Prepare the Environment using `setup-env.sh`

The E2E test environment, including PostgreSQL database setup and Chainlink core preparation, is managed by the `scripts/e2e/setup-env.sh` script. This script performs several key actions:

* Verifies the Chainlink Core version against .core_version.
* Starts a PostgreSQL 14 container (named cl_pg) for testing.
* Prepares the Chainlink Core repository by modifying its go.mod to use your local `chainlink-ton`, updates Go dependencies, builds a ccip.test binary, and prepares the test database schema.
* Prints an export `CL_DATABASE_URL=...` command for you to use in your shell.

To set up the environment, run:

```bash
./scripts/e2e/setup-env.sh [--core-dir /path/to/chainlink_core]
```

**Arguments:**

* `-c`, `--core-dir` `/path/to/chainlink_core`: (Optional) Path to your local chainlink repository (defaults to ../chainlink).

After this script completes successfully, it will print an export `CL_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable"` command (or similar). You must execute this export command in your current terminal session to make the database URL available for the `run-test.sh` script.

## 4. Running Tests Locally

After successfully running setup-env.sh and executing the export `CL_DATABASE_URL=...` command provided by its output, you can execute E2E tests using the `scripts/e2e/run-test.sh` script.

### 4.1. Usage

**Using the Nix E2E Shell (Recommended):**

1. Ensure you are inside the Nix E2E shell (`nix develop .#ccip-e2e`).
2. If you haven't set up the environment in this session using the CI-like command, you can run the setup-env script:

```bash
  ./scripts/e2e/setup-env.sh --core-dir /path/to/chainlink_core  # (Or your desired path)
```

3. Then run tests using the run-test script:

```bash
  ./scripts/e2e/run-test.sh --core-dir /path/to/chainlink_core --test-command "<go_test_command>"
```

Example:

```bash
./scripts/e2e/run-test.sh --core-dir ../chainlink --test-command "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -count=1 -json"
```

* `-c`, `--core-dir /path/to/chainlink_core`: (Optional) Path to your local chainlink repository (defaults to `../chainlink`). This should match the one used with `setup-env.sh`.

**Note**: After you execute this export command, the CL_DATABASE_URL is set for your current Nix shell session. This variable is typically available again even if you exit and re-enter the shell using nix develop ., as long as the environment is consistently activated in the same way. If it’s not available in a new session, you may need to re-export it manually.
This approach provides the environmental consistency of Nix while allowing you to execute each step of the testing process individually. This can be easier for development, allowing you to inspect the state or re-run specific steps without exiting the Nix environment. To exit the Nix shell when you are done, you can typically type `exit`.

### 4.2. Example Workflow (Manual/Standalone)

1. Set up the environment:

```bash
./scripts/e2e/setup-env.sh
```

2. Export the database URL (use the exact command printed by `setup-env.sh`):

```bash
export CL_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable"
```

3. Run the tests:

```bash
./scripts/e2e/run-test.sh --test-command "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -count=1 -json"
```

## 5. How It Works

The E2E testing process is managed by two main scripts: `setup-env.sh` and `run-test.sh`

5.1. `setup-env.sh` (Environment Setup)
This script prepares the testing environment:

1. Resolves Paths: Determines absolute paths for `chainlink-ton` (current repo) and the target `chainlink` core directory.
2. Validates Project Directories: Checks for the existence of `go.mod` in both project directories.
3. Verifies Chainlink Core Version: Compares the current commit of the local chainlink core checkout against the Git reference in `scripts/.core_version`. Errors if there's a mismatch or if the reference cannot be resolved. Users are prompted to checkout the correct version if a mismatch occurs.
4. Manages PostgreSQL:
   * Stops and removes any existing PostgreSQL container named `cl_pg`.
   * Starts a new `postgres:14-alpine` Docker container named `cl_pg`, exposing the default PostgreSQL port.
   * Waits for the PostgreSQL server to become ready for connections.
5. Provides Database URL: Composes the `CL_DATABASE_URL` (e.g., `postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable`) and prints the export command for the user to set it in their current shell.
6. Prepares Chainlink Core Repository:
   * Changes to the `chainlink` core directory.
   * Modifies `chainlink`'s `go.mod` to replace `github.com/smartcontractkit/chainlink-ton` with the local `chainlink-ton` project path.
   * Runs `go run github.com/jmank88/gomods@v0.1.5 tidy` (or equivalent `go mod tidy` if the helper is not used).
   * Downloads Go module dependencies (`go mod download` for the main module and `integration-tests` if present).
   * Builds the `ccip.test` binary (`go build -o ccip.test .`).
   * Prepares the test database schema using `./ccip.test local db preparetest`.

5.2. `run-test.sh` (Test Execution)
This script executes the specified tests after the environment has been prepared by `setup-env.sh` and `CL_DATABASE_URL` has been exported:

1. Resolves Paths: Determines the absolute path for the `chainlink` core directory.
2. Verifies Chainlink Core Version (Again): Performs a similar check as `setup-env.sh` to ensure the `chainlink` core version is still correct before running tests. This acts as a safeguard.
3. Checks Database URL: Verifies that the `CL_DATABASE_URL` environment variable is set. Errors if not, prompting the user to run `setup-env.sh` and export the variable.
4. Executes Tests: Changes to the `chainlink` core directory and runs the Go test command provided via the `--test-command` argument. The `CL_DATABASE_URL` is available to these tests.

## 6. CI

E2E tests are fully integrated into the GitHub Actions CI pipeline.

* The workflow is defined in `.github/workflows/ccip-integration-test.yml`
* This workflow reads the `.core_version` file to determine the `chainlink` reference.
* It then checks out this specific `chainlink` version.
* It executes `scripts/e2e/setup-env.sh` to prepare the environment. The `CL_DATABASE_URL` output by `setup-env.sh` is captured and exported for subsequent steps in the CI job.
* Subsequently, it executes `scripts/e2e/run-test.sh` with various test commands defined in the workflow matrix.

## 7. Key Files

* `scripts/.core_version`: The definitive source of truth for the `chainlink` Git reference used in tests.
* `scripts/e2e/setup-env.sh`: Script for setting up the E2E testing environment, including DB and Chainlink Core preparation.
* `scripts/e2e/run-test.sh`: Script for executing the E2E tests after the environment is set up.
* `.github/workflows/ccip-integration-test.yml`: The GitHub Actions CI workflow that automates E2E testing.
