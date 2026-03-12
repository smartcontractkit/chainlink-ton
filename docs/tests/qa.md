# QA

The QA suite is divided into two groups: fully automated tests and semi-automated tests. The automated tests are run in CI and are designed to be fast and reliable, while the manual tests involve some human interaction.

## Test suites

### Automated tests

The first group of tests are fully automated. They are run by calling `RunSmokeTests` function in [`chainlink-ccip`](https://github.com/smartcontractkit/chainlink-ccip/blob/main/devenv/tests/smoke.go#L29).

### Interactive tests

Interactive tests require some human interaction like verifying the state of a message in [CCIP Explorer](https://ccip.chain.link/). These tests are run by calling [`RunQAInteractiveTests`](https://github.com/smartcontractkit/chainlink-ccip/blob/main/devenv/tests/qa_manual.go#L21) function, first building a test binary with `go test -c -o <binary_name>` and then running the binary `./<binary_name>`. The test will prompt the user to verify the state of the message in CCIP Explorer and ask for confirmation to proceed with the test.

### Local testing setup

These tests are run from `chainlink-ccip` repo (`devenv/tests/e2e/smoke_test.go`). To run test locally, you need to setup the environment with devenvs. Follow the instructions in [devenv README](https://github.com/smartcontractkit/chainlink-ccip/blob/main/devenv/README.md) to setup the environment.

Manual QA is not supported as CCIP Explorer is not available in local environment.

### Running tests against deployed environments

Tests can also be run against any environment defined on `chainlink-deployments` repo. Follow the instructions in [chainlink-deployments README](https://github.com/smartcontractkit/chainlink-deployments/blob/main/domains/ccip/test/README.md) to setup the environment and run the tests.
