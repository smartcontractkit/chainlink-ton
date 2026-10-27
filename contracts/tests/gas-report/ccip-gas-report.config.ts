import type { Config } from 'jest'

// Gas report config for the CCIP message-flow benchmarks under tests/gas-report/ccip/*.
// Note: the gas report is generated from the last test executed; create additional configs for
// separate reports (e.g. the token/pool calibration configs in this directory).
const config: Config = {
  rootDir: '../..',
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testMatch: ['**/tests/gas-report/ccip/**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['/node_modules/', '/dist/', '/vendor/'],
  testTimeout: 120000,
  reporters: [
    'default',
    [
      '@ton/sandbox/jest-reporter',
      {
        snapshotDir: '.snapshot',
        contractDatabase: 'contract.abi.json',
        reportName: 'tests/gas-report/ccip-gas-report',
        depthCompare: 2,
        removeRawResult: true,
      },
    ],
  ],
}

export default config
