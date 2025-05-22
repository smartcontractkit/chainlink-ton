# Chainlink-TON End-to-End Testing Setup

This guide details the setup and execution of CCIP integration tests within the `chainlink-ton` repository. These tests are crucial for verifying the correct integration of `chainlink-ton` with a specific version of `chainlink` core.

## 1. Overview

The primary goals of this End-to-End (E2E) testing setup are:

* **Consistent Environments:** Ensure identical testing setups for both local development and Continuous Integration (CI) pipelines.
* **Rapid Iteration:** Facilitate quick verification of `chainlink-ton` changes against the `chainlink` core.
* **Version Control:** Establish the `.core_version` file as the definitive source for the `chainlink` core version used in testing.

## 2. Prerequisites

To run E2E tests locally, you will need:

* **Docker:** Essential for running PostgreSQL and for individual test setup.
* **Chainlink Repository:** A local clone of `smartcontractkit/chainlink`.
* **Nix (Optional):** Recommended for mirroring the CI environment locally and ensuring consistency.

## 3. Setup

Follow these steps to set up your E2E testing environment:

### 3.1. Clone Chainlink

Clone the `smartcontractkit/chainlink` repository. By default, the script expects it in `../chainlink`, but you can specify a different path.

```bash
git clone https://github.com/smartcontractkit/chainlink.git ../chainlink
```

### 3.2. `.core_version` File

The `scripts/e2e/.core_version` file within this repository specifies the `chainlink` Git reference (branch, tag, or commit) to be used for tests. The `run-e2e-test.sh` script automatically ensures your local `chainlink` checkout matches this specified version.

### 3.3. Start PostgreSQL

E2E tests require a PostgreSQL database. The following command starts PostgreSQL 14, which the test script will connect to using `postgresql://postgres:postgres@localhost:5432/chainlink_test?sslmode=disable`.

> **NOTE:** This setup is subject to change in the near future, pending further integration of the test setup.

```bash
docker run --rm --name ccip-ton-e2e-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chainlink_test -p 5432:5432 postgres:14
```

## 4. Running Tests Locally

Execute E2E tests using the `scripts/e2e/run-e2e-test.sh` script.

### 4.1. Usage

```bash
./scripts/e2e/run-e2e-test.sh --test-command "<go_test_command>" [--core-dir /path/to/chainlink_core]
```

**Arguments:**

* `--test-command "<go_test_command>"`: (Required) The Go test command to be executed within `chainlink`.
    * **Example:** `"cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -count=1 -json"`
* `-c, --core-dir /path/to/chainlink`: (Optional) Path to your local `chainlink` repository (defaults to `../chainlink`).

### 4.2. Example Command

```bash
./scripts/e2e/run-e2e-test.sh --test-command "cd integration-tests/smoke/ccip && go test ccip_ton_messaging_test.go -timeout 12m -count=1 -json"
```

### 4.3. Using Nix

For consistency with the CI environment, you can run the tests using Nix:

```bash
nix develop . -c ./scripts/e2e/run-e2e-test.sh --test-command "your_test_command_here"
```

## 5. How It Works

The `run-e2e-test.sh` script orchestrates the E2E testing process by performing the following actions:

1.  **Validates Directories:** Confirms the presence of both `chainlink-ton` and `chainlink` project directories.
2.  **Checks Chainlink Version:** Verifies that your local `chainlink` checkout matches the Git reference specified in `scripts/e2e/.core_version`. It will error if a mismatch is detected.
3.  **Prepares Chainlink:**
    * Modifies `chainlink`'s `go.mod` file to use the local `chainlink-ton` module.
    * Updates Go dependencies (`go mod tidy`, `go mod download`).
    * Builds the `ccip.test` binary.
4.  **Sets CL_DATABASE_URL:** Configures the database connection for the tests.
5.  **Prepares Test Database:** Executes `./ccip.test local db preparetest`.
6.  **Executes Tests:** Runs your specified Go test command within the prepared `chainlink` environment.

## 6. CI Integration

E2E tests are fully integrated into the GitHub Actions CI pipeline.

* The workflow is defined in `.github/workflows/ccip-integration-test.yml`.
* This workflow reads the `.core_version` file to determine the `chainlink` reference.
* It then checks out this specific `chainlink` version, sets up PostgreSQL, and executes `run-e2e-test.sh` with various test commands defined in the workflow matrix.

## 7. Key Files

* `scripts/e2e/run-e2e-test.sh`: The main script responsible for orchestrating E2E tests.
* `scripts/e2e/.core_version`: The definitive source of truth for the `chainlink` Git reference used in tests.
* `.github/workflows/ccip-integration-test.yml`: The GitHub Actions CI workflow that automates E2E testing.