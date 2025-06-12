import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as counter from '../../../wrappers/examples/Counter'

const ERROR_ONLY_CALLABLE_BY_OWNER = 132
const ERROR_CANNOT_TRANSFER_TO_SELF = 1001
const ERROR_MUST_BE_PROPOSED_OWNER = 1002

describe('Ownable2Step Counter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>

  let bind: {
    counter: SandboxContract<counter.ContractClient>
    ownable: SandboxContract<ownable2step.ContractClient>
  } = {
    counter: null as any,
    ownable: null as any,
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    let code = await compile('examples.Counter')
    let data: counter.ContractData = {
      id: 1,
      value: 14,
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
    }

    bind.counter = blockchain.openContract(counter.ContractClient.newFrom(data, code))
    bind.ownable = blockchain.openContract(ownable2step.ContractClient.newAt(bind.counter.address))

    const deployResult = await bind.counter.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.counter.address,
      deploy: true,
      success: true,
    })
  })

  it('Test01: Should set deployer as owner', async () => {
    const owner = await bind.ownable.getOwner()

    expect(owner).toEqualAddress(deployer.address)
  })

  it('Test02: Should allow owner to call SetCount', async () => {
    const owner = await blockchain.treasury('deployer')

    const newCount = 100

    const result = await bind.counter.sendSetCount(owner.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount: newCount,
    })
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: bind.counter.address,
      success: true,
    })

    const countAfterTx = await bind.counter.getValue()

    expect(countAfterTx).toBe(newCount)
  })

  it('Test03: Should prevent non owner from calling SetCount', async () => {
    const other = await blockchain.treasury('other')
    const initialCount = await bind.counter.getValue()

    const result = await bind.counter.sendSetCount(other.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount: 100,
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })

    const countAfterTx = await bind.counter.getValue()

    expect(countAfterTx).toBe(initialCount)
  })

  it('Test04: TransferOwnership should not directly transfer the ownership', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const initialCount = await bind.counter.getValue()

    const resultTransferOwnership = await bind.ownable.sendTransferOwnership(
      owner.getSender(),
      toNano('0.05'),
      {
        queryId: 1n,
        newOwner: other.address,
      },
    )
    expect(resultTransferOwnership.transactions).toHaveTransaction({
      from: owner.address,
      to: bind.counter.address,
      success: true,
    })

    // Check that the owner is still the original one
    const contractOwner = await bind.ownable.getOwner()
    expect(contractOwner.toString()).toBe(owner.address.toString())

    // Check that the pending owner cannot operate as owner
    const resultSetCount = await bind.counter.sendSetCount(other.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount: 100,
    })

    expect(resultSetCount.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })

    const countAfterTx = await bind.counter.getValue()

    expect(countAfterTx).toBe(initialCount)
  })

  it('Test05: AcceptOwnership should transfer the ownership', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')

    await bind.ownable.sendTransferOwnership(owner.getSender(), toNano('0.05'), {
      queryId: 1n,
      newOwner: other.address,
    })

    const resultAcceptOwnership = await bind.ownable.sendAcceptOwnership(
      other.getSender(),
      toNano('0.05'),
      {
        queryId: 1n,
      },
    )
    expect(resultAcceptOwnership.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      success: true,
    })

    // Check that the owner is now the new one
    const newOwner = await bind.ownable.getOwner()
    expect(newOwner.toString()).toBe(other.address.toString())

    // Check that the new owner can operate as owner
    const resultSetCount = await bind.counter.sendSetCount(other.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount: 100,
    })

    expect(resultSetCount.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      success: true,
    })

    const countAfterTx = await bind.counter.getValue()
    expect(countAfterTx).toBe(100)
  })

  it('Test06 : AcceptOwnership should not allow the original owner to operate as owner', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    await bind.ownable.sendTransferOwnership(owner.getSender(), toNano('0.05'), {
      queryId: 1n,
      newOwner: other.address,
    })
    await bind.ownable.sendAcceptOwnership(other.getSender(), toNano('0.05'), {
      queryId: 1n,
    })

    // Check that the original owner cannot operate as owner
    const resultSetCount = await bind.counter.sendSetCount(owner.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount: 100,
    })
    expect(resultSetCount.transactions).toHaveTransaction({
      from: owner.address,
      to: bind.counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })
  })

  it('Test07: Should prevent users from calling AcceptOwnership with no pending owner ', async () => {
    const other = await blockchain.treasury('other')
    const result = await bind.ownable.sendAcceptOwnership(other.getSender(), toNano('0.05'), {
      queryId: 1n,
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
      success: false,
    })
  })

  it('Test08: Should prevent random users from calling AcceptOwnership with pending owner', async () => {
    const pendingOwner = await blockchain.treasury('pendingOwner')
    const other = await blockchain.treasury('other')

    await bind.ownable.sendTransferOwnership(deployer.getSender(), toNano('0.05'), {
      queryId: 1n,
      newOwner: pendingOwner.address,
    })

    const result = await bind.ownable.sendAcceptOwnership(other.getSender(), toNano('0.05'), {
      queryId: 1n,
    })

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: bind.counter.address,
      exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
      success: false,
    })
  })

  it('Test09: Should prevent non owner from calling TransferOwnership', async () => {
    const other = await blockchain.treasury('other')
    const result = await bind.ownable.sendTransferOwnership(other.getSender(), toNano('0.05'), {
      queryId: 1n,
      newOwner: other.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: bind.ownable.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })
  })

  it('Test10: Should prevent transfer to self', async () => {
    const owner = await blockchain.treasury('deployer')
    const result = await bind.ownable.sendTransferOwnership(owner.getSender(), toNano('0.05'), {
      queryId: 1n,
      newOwner: owner.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: bind.ownable.address,
      exitCode: ERROR_CANNOT_TRANSFER_TO_SELF,
      success: false,
    })
  })
})
