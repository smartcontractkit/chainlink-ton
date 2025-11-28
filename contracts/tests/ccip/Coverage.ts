import { compile } from '@ton/blueprint'
import { Cell, Contract } from '@ton/core'
import { Blockchain, Coverage } from '@ton/sandbox'
import { mkdirSync, writeFileSync } from 'fs'

// these should be used by the test suite calling generateCoverageArtifacts
export const ROUTER_COVERAGE_NAME = 'router_coverage'
export const OFFRAMP_COVERAGE_NAME = 'offramp_coverage'
export const FEEQUOTER_COVERAGE_NAME = 'feequoter_coverage'
export const ONRAMP_COVERAGE_NAME = 'onramp_coverage'
export const MERKLEROOT_COVERAGE_NAME = 'merkleroot_coverage'
export const SEND_EXECUTOR_COVERAGE_NAME = 'send_executor_coverage'
export const RECEIVE_EXECUTOR_COVERAGE_NAME = 'receive_executor_coverage'

export type ContractCoverageConfig = {
  code: Cell | string //code, or contract name to compile directly
  name: string
}

export async function generateCoverageArtifacts(
  blockchain: Blockchain,
  testSuitePrefix: string,
  contracts: ContractCoverageConfig[],
) {
  mkdirSync('./.coverage', { recursive: true })
  contracts.forEach(async (contract) => {
    let contractCode: Cell
    if (typeof contract.code === 'string') {
      contractCode = await compile(contract.code)
    } else {
      contractCode = contract.code
    }
    const coverage = blockchain.coverageForCell(contractCode)
    if (!coverage) {
      console.log(`No coverage data for contract: ${contract.name}`)
      return
    }
    console.log('coverage summary: ', coverage.summary())
    const coverageJson = coverage.toJson()
    writeFileSync(`./.coverage/${testSuitePrefix}_${contract.name}.json`, coverageJson)
  })
}
