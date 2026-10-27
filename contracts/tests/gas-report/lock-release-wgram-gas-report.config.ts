import type { Config } from 'jest'

// LockRelease token pool with wGRAM: lock + release calibration.
const config: Config = {
  rootDir: '../..',
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testMatch: ['**/tests/gas-report/pools/lock_release_wgram.spec.ts'],
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
        reportName: 'tests/gas-report/lock-release-wgram-gas-report',
        contractExcludes: ['CctHarness', 'WgramHarness', 'TreasuryContract', 'ContractClient'],
        depthCompare: 2,
        removeRawResult: true,
      },
    ],
  ],
}

export default config
