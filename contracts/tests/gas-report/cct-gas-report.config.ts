import type { Config } from 'jest'

// CCT token: mint / transfer / burn calibration.
const config: Config = {
  rootDir: '../..',
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testMatch: ['**/tests/gas-report/token/cct.spec.ts'],
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
        reportName: 'tests/gas-report/cct-gas-report',
        contractExcludes: ['CctHarness', 'WgramHarness', 'TreasuryContract', 'ContractClient'],
        depthCompare: 2,
        removeRawResult: true,
      },
    ],
  ],
}

export default config
