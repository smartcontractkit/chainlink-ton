import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
import * as coverage from '../../coverage/coverage'

export async function ownable2StepSpec(
  deployer: SandboxContract<TreasuryContract>,
  other: SandboxContract<TreasuryContract>,
  contract: SandboxContract<ownable2step.Interface>,
  blockchain?: Blockchain,
  coverageConfigs?: coverage.ContractCoverageConfig[],
) {
  const resultTransferOwnership = await contract.sendTransferOwnership(
    deployer.getSender(),
    toNano('0.05'),
    {
      queryId: 1n,
      newOwner: other.address,
    },
  )
  expect(resultTransferOwnership.transactions).toHaveTransaction({
    from: deployer.address,
    to: contract.address,
    success: true,
  })

  const resultAcceptOwnership = await contract.sendAcceptOwnership(
    other.getSender(),
    toNano('0.05'),
    {
      queryId: 1n,
    },
  )
  expect(resultAcceptOwnership.transactions).toHaveTransaction({
    from: other.address,
    to: contract.address,
    success: true,
  })

  // Check that the owner is now the new one
  const newOwner = await contract.getOwner()
  expect(newOwner.toString()).toBe(other.address.toString())

  if (process.env['COVERAGE'] === 'true' && coverageConfigs && blockchain) {
    coverage.generateCoverageArtifacts(blockchain, 'ownable2step_tests', coverageConfigs)
  }
}
