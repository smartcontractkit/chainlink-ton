import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: '@ton/sandbox/jest-environment',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/vendor/'],
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
}

export default config
