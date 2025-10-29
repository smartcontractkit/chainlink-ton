import type { Config } from 'jest'

// Gas report configuration for GasBaseline test
// This config generates ccip-gas-report.json from the configured CCIP message flow test under tests/gas-report/ccip/*
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testMatch: ['**/tests/gas-report/ccip/**/*.spec.ts'],
  modulePathIgnorePatterns: ['/node_modules/', '/dist/', '/vendor/'],
  testTimeout: 120000, // 120 seconds for long-running gas tests
  reporters: [
    'default',
    [
      '@ton/sandbox/jest-reporter',
      {
        snapshotDir: '.snapshot',
        contractDatabase: 'contract.abi.json',
        reportName: 'ccip-gas-report',
        depthCompare: 2,
        removeRawResult: true,
      },
    ],
  ],
}

export default config
