import {
  Address,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  toNano,
  TupleItem,
  TupleReader,
} from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

export async function ownable2StepSpec(
  deployer: SandboxContract<TreasuryContract>,
  other: SandboxContract<TreasuryContract>,
  contract: SandboxContract<ownable2step.ContractClient>,
  opts: {
    coverage?: {
      blockchain: Blockchain
      conf: coverage.ContractCoverageConfig[]
    }
  },
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
  const pendingOwner = await contract.getPendingOwner()
  expect(pendingOwner).toBeDefined()
  expect(pendingOwner).toEqual(other.address)

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
  expect(newOwner).toEqual(other.address)

  if (process.env['COVERAGE'] === 'true' && opts.coverage) {
    await coverage.generateCoverageArtifacts(
      opts.coverage.blockchain,
      'ownable2step_tests',
      opts.coverage.conf,
    )
  }
}
