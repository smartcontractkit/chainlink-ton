import { Cell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { mkdirSync, writeFileSync } from 'fs'

import { contractCode } from '../../wrappers/codeLoader'

export const CoverageContractName = {
  router: 'router',
  offramp: 'offramp',
  feequoter: 'feequoter',
  onramp: 'onramp',
  merkleroot: 'merkleroot',
  send_executor: 'send_executor',
  receive_executor: 'receive_executor',
  deployable: 'deployable',
  mcms: 'mcms',
  timelock: 'timelock',
} as const
export type CoverageConfigNames = keyof typeof CoverageContractName

export type ContractCoverageConfig = {
  code: Cell | string //code, or contract name to compile directly
  name: CoverageConfigNames
}

export async function generateCoverageArtifacts(
  blockchain: Blockchain,
  testSuitePrefix: string,
  contracts: ContractCoverageConfig[],
) {
  mkdirSync('./.coverage', { recursive: true })
  await Promise.all(
    contracts.map(async (contract) => {
      let code: Cell
      if (typeof contract.code === 'string') {
        code = await contractCode.ccip.local(contract.code)
      } else {
        code = contract.code
      }
      const coverage = blockchain.coverageForCell(code)
      if (!coverage) {
        console.log(`No coverage data for contract: ${contract.name}`)
        return
      }
      console.log('coverage summary: ', coverage.summary())
      const coverageJson = coverage.toJson()
      writeFileSync(`./.coverage/${testSuitePrefix}_${contract.name}.json`, coverageJson)
    }),
  )
}
