import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  modulePathIgnorePatterns: ['/node_modules/', '/dist/', '/vendor/'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/gas-report/'], // exclude gas report tests (run separately with yarn ccip-gas-report)
  reporters: [
    'default',
    [
      '@ton/sandbox/jest-reporter',
      {
        // options
        snapshotDir: '.snapshot', // output folder for benchmark reports, default: '.snapshot'
        contractDatabase: 'contract.abi.json', // path or json a map of known contracts, see Collect metric API, default: 'contract.abi.json'
        reportName: 'gas-report', // report name, default: 'gas-report'
        depthCompare: 2, // comparison depth, default: 2
        removeRawResult: true, // remove raw metric file, default: true
      },
    ],
  ],
  maxWorkers: '50%',
  workerThreads: true,

  testTimeout: 30000, // Overwrite default 5s timeout

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
