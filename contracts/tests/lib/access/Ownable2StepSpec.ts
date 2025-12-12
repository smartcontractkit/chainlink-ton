import { Address, Cell, ContractProvider, Sender, toNano, TupleItem, TupleReader } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

interface Basic {
  address: Address

  sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell): Promise<void>

  getAny(provider: ContractProvider, name: string, args: TupleItem[]): Promise<TupleReader>
}

export async function ownable2StepSpec(
  deployer: SandboxContract<TreasuryContract>,
  other: SandboxContract<TreasuryContract>,
  contract: SandboxContract<Basic>,
  opts: {
    prefix?: {
      opcode: number
      getter: string
    }
    coverage?: {
      blockchain: Blockchain
      conf: coverage.ContractCoverageConfig[]
    }
  },
) {
  const resultTransferOwnership = await contract.sendInternal(
    deployer.getSender(),
    toNano('0.05'),
    ownable2step.builder.message.in
      .transferOwnershipWithPrefix(opts.prefix?.opcode)
      .encode({
        queryId: 1n,
        newOwner: other.address,
      })
      .asCell(),
  )
  expect(resultTransferOwnership.transactions).toHaveTransaction({
    from: deployer.address,
    to: contract.address,
    success: true,
  })
  const pendingOwner = await contract
    .getAny(prefix(opts.prefix?.getter, 'pendingOwner'), [])
    .then((stack) => stack.readAddressOpt())
  expect(pendingOwner).toBeDefined()
  expect(pendingOwner && pendingOwner.equals(other.address)).toBe(true)

  const resultAcceptOwnership = await contract.sendInternal(
    other.getSender(),
    toNano('0.05'),
    ownable2step.builder.message.in
      .acceptOwnershipWithPrefix(opts.prefix?.opcode)
      .encode({
        queryId: 1n,
      })
      .asCell(),
  )
  expect(resultAcceptOwnership.transactions).toHaveTransaction({
    from: other.address,
    to: contract.address,
    success: true,
  })

  // Check that the owner is now the new one
  const newOwner = await contract
    .getAny(prefix(opts.prefix?.getter, 'owner'), [])
    .then((stack) => stack.readAddress())
  expect(newOwner.toString()).toBe(other.address.toString())

  if (process.env['COVERAGE'] === 'true' && opts.coverage) {
    await coverage.generateCoverageArtifacts(
      opts.coverage.blockchain,
      'ownable2step_tests',
      opts.coverage.conf,
    )
  }
}

function prefix(getter: string | undefined, field: string): string {
  return `${getter ? getter + '_' : ''}${field}`
}
