---
id: contracts-coverage
title: Coverage
sidebar_label: Coverage
sidebar_position: 5
---

# Chainlink TON - Smart Contracts - Coverage

Sandbox blockchain can track the executed instructions for every deployed contract and generate a coverage report. [see the Sandbox test coverage docs.](https://github.com/ton-org/sandbox/blob/develop/docs/coverage-guide.md)

Assembly FIFT code is parsed from the contract's code cell, and the Sandbox Blockchain object will track the execution of each instruction from the code.

To run a test suite with coverage metrics on, set the `COVERAGE` env var to true and run the test suite. You can execute this using the following command.

```bash
cd contracts
yarn test-coverage
```

This generates json artifacts with coverage data for each test suite, to merge the results run the `scriptMergeCoverageIntoHtmlReports.ts` script with the following command.

```bash
cd contracts
yarn generate-coverage-reports
```
