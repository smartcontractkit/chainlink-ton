# Chainlink-TON End-to-End Testing Setup

This guide details the setup and execution of CCIP integration tests within the `chainlink-ton` repository. These tests are crucial for verifying the correct integration of `chainlink-ton` with a specific version of `chainlink` core.

## Overview

The primary goals of this End-to-End (E2E) testing setup are:

* **Consistent Environments:** Ensure identical testing setups for both local development and CI pipelines.
* **Rapid Iteration:** Facilitate quick verification of `chainlink-ton` changes against the `chainlink` core.
* **Version Control:** Establish the `.core_version` file as the definitive source for the `chainlink` core version used in testing.

The process involves two main scripts:

1. `scripts/e2e/setup-env.sh`: Prepares the testing environment, including database setup and Chainlink core configuration.
2. `scripts/e2e/run-test.sh`: Executes the specified tests within the prepared environment.

## Setup & Running Tests Locally

### Prerequisites

* **Docker:** Essential for running PostgreSQL (managed by `setup-env.sh`).
* **Chainlink Repository:** A local clone of `smartcontractkit/chainlink`.
* **Nix (Recommended):** Provides a consistent development environment (`.#ccip-e2e`) with all other necessary dependencies pre-configured.

### Quick Start

1. Enter the Nix Shell:

    ```bash
    nix develop .#ccip-e2e
    ```

2. Clone Chainlink Core (if not already done):

    ```bash
    git clone https://github.com/smartcontractkit/chainlink.git ../chainlink
    ```

3. Setup environment:

    ```bash
    ./scripts/e2e/setup-env.sh [--core-dir /path/to/chainlink_core]
    ```

4. Export test database URL:

    ```bash
    export CL_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable"
    ```

5. Run tests:

    ```bash
    ./scripts/e2e/run-test.sh --core-dir /path/to/chainlink_core --test-command "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -count=1 -json"
    ```

**Notes:**
<!---
    TODO: Align this `.core_version` Git reference with the Chainlink version tag used for the BASE_IMAGE (e.g., `public.ecr.aws/chainlink/chainlink:vX.Y.Z-plugins`) in Docker build scripts like `scripts/build/build-image.sh`. This synchronization will ensure consistency between source-based integration tests and the plugin's runtime environment within the Docker image, removing discrepancies that could arise from using two different core dependency sources/versions.
-->
* The `scripts/.core_version` file specifies the required Chainlink core version. The setup script will verify your checkout matches this version.
* Manual usage: Skip step 1 to run without Nix
* Core directory: Use `--core-dir` to specify a different path (defaults to `../chainlink`)

## How It Works

The E2E testing process is managed by two main scripts: `setup-env.sh` and `run-test.sh`

**`setup-env.sh` (Environment Setup)**
setup-env.sh prepares the testing environment by:

* Verifying your Chainlink core checkout matches the required version in `.core_version`
* Starting a PostgreSQL container for test data
* Modifying Chainlink's `go.mod` to use your local chainlink-ton code
* Building the test binary and preparing the database schema

**`run-test.sh` (Test Execution)**
run-test.sh executes your tests by:

* Validating the environment is properly configured
* Running the specified Go test command in the Chainlink core directory

## CI

E2E tests run automatically through GitHub Actions (`.github/workflows/ccip-integration-test.yml`) with these CI-specific features:

**Test Matrix**: Tests execute in parallel using a matrix strategy.

**Execution**: The workflow also reads `.core_version`, checks out the specified Chainlink core version, then runs both setup and test scripts within the `ccip-e2e` Nix shell for environment consistency.

## Key Files

* `scripts/.core_version`: The definitive source of truth for the `chainlink` Git reference used in tests.
* `scripts/e2e/setup-env.sh`: Script for setting up the E2E testing environment, including DB and Chainlink Core preparation.
* `scripts/e2e/run-test.sh`: Script for executing the E2E tests after the environment is set up.
* `.github/workflows/ccip-integration-test.yml`: The GitHub Actions CI workflow that automates E2E testing.
