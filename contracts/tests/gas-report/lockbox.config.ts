import type { Config } from 'jest'

// JettonLockBox deposit/withdraw calibration.
const config: Config = {
  rootDir: '../..',
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testMatch: ['**/tests/gas-report/pools/lockbox.spec.ts'],
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
        reportName: 'tests/gas-report/lockbox-gas-report',
        contractExcludes: [
          'JettonLockBoxHarness',
          'JettonMinter',
          'JettonWallet',
          'TreasuryContract',
          'ContractClient',
        ],
        depthCompare: 2,
        removeRawResult: true,
      },
    ],
  ],
}

export default config
