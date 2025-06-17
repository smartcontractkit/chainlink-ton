import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'
import { OwnableCounter, OwnableCounterStorage } from '../wrappers/access/tolk_OwnableCounter'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'

const ERROR_ONLY_CALLABLE_BY_OWNER = 132
const ERROR_CANNOT_TRANSFER_TO_SELF = 1001
const ERROR_MUST_BE_PROPOSED_OWNER = 1002

describe('Ownable2Step Counter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let counter: SandboxContract<OwnableCounter>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    let code = await compile('OwnableTolkCounter')
    let data: OwnableCounterStorage = {
      id: 1,
      count: 14,
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
    }

    counter = blockchain.openContract(OwnableCounter.createFromConfig(data, code))

    const deployResult = await counter.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: counter.address,
      deploy: true,
      success: true,
    })
  })

  it('Test01: Should set deployer as owner', async () => {
    const owner = await counter.getOwner()

    expect(owner.toString()).toEqual(deployer.address.toString())
  })

  it('Test02: Should allow owner to call SetCount', async () => {
    const owner = await blockchain.treasury('deployer')

    const newCount = 100

    const result = await counter.sendSetCount(owner.getSender(), {
      value: toNano('0.05'),
      count: newCount,
    })
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: counter.address,
      success: true,
    })

    const countAfterTx = await counter.getCounter()

    expect(countAfterTx).toBe(newCount)
  })

  it('Test03: Should prevent non owner from calling SetCount', async () => {
    const other = await blockchain.treasury('other')
    const initialCount = await counter.getCounter()

    const result = await counter.sendSetCount(other.getSender(), {
      value: toNano('0.05'),
      count: 100,
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })

    const countAfterTx = await counter.getCounter()

    expect(countAfterTx).toBe(initialCount)
  })

  it('Test04: TransferOwnership should not directly transfer the ownership', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const initialCount = await counter.getCounter()

    const resultTransferOwnership = await counter.sendTransferOwnership(owner.getSender(), {
      value: toNano('0.05'),
      newOwner: other.address,
    })
    expect(resultTransferOwnership.transactions).toHaveTransaction({
      from: owner.address,
      to: counter.address,
      success: true,
    })

    // Check that the owner is still the original one
    const contractOwner = await counter.getOwner()
    expect(contractOwner.toString()).toBe(owner.address.toString())

    // Check that the pending owner cannot operate as owner
    const resultSetCount = await counter.sendSetCount(other.getSender(), {
      value: toNano('0.05'),
      count: 100,
    })

    expect(resultSetCount.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })

    const countAfterTx = await counter.getCounter()

    expect(countAfterTx).toBe(initialCount)
  })

  it('Test05: AcceptOwnership should transfer the ownership', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')

    await counter.sendTransferOwnership(owner.getSender(), {
      value: toNano('0.05'),
      newOwner: other.address,
    })

    const resultAcceptOwnership = await counter.sendAcceptOwnership(other.getSender(), {
      value: toNano('0.05'),
    })
    expect(resultAcceptOwnership.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      success: true,
    })

    // Check that the owner is now the new one
    const newOwner = await counter.getOwner()
    expect(newOwner.toString()).toBe(other.address.toString())

    // Check that the new owner can operate as owner
    const resultSetCount = await counter.sendSetCount(other.getSender(), {
      value: toNano('0.05'),
      count: 100,
    })

    expect(resultSetCount.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      success: true,
    })

    const countAfterTx = await counter.getCounter()
    expect(countAfterTx).toBe(100)
  })

  it('Test06 : AcceptOwnership should not allow the original owner to operate as owner', async () => {
    const owner = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    await counter.sendTransferOwnership(owner.getSender(), {
      value: toNano('0.05'),
      newOwner: other.address,
    })
    await counter.sendAcceptOwnership(other.getSender(), {
      value: toNano('0.05'),
    })

    // Check that the original owner cannot operate as owner
    const resultSetCount = await counter.sendSetCount(owner.getSender(), {
      value: toNano('0.05'),
      count: 100,
    })
    expect(resultSetCount.transactions).toHaveTransaction({
      from: owner.address,
      to: counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })
  })

  it('Test07: Should prevent users from calling AcceptOwnership with no pending owner ', async () => {
    const other = await blockchain.treasury('other')
    const result = await counter.sendAcceptOwnership(other.getSender(), {
      value: toNano('0.05'),
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
      success: false,
    })
  })

  it('Test08: Should prevent random users from calling AcceptOwnership with pending owner', async () => {
    const pendingOwner = await blockchain.treasury('pendingOwner')
    const other = await blockchain.treasury('other')

    await counter.sendTransferOwnership(deployer.getSender(), {
      value: toNano('0.05'),
      newOwner: pendingOwner.address,
    })

    const result = await counter.sendAcceptOwnership(other.getSender(), {
      value: toNano('0.05'),
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      exitCode: ERROR_MUST_BE_PROPOSED_OWNER,
      success: false,
    })
  })

  it('Test09: Should prevent non owner from calling TransferOwnership', async () => {
    const other = await blockchain.treasury('other')
    const result = await counter.sendTransferOwnership(other.getSender(), {
      value: toNano('0.05'),
      newOwner: other.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: counter.address,
      exitCode: ERROR_ONLY_CALLABLE_BY_OWNER,
      success: false,
    })
  })

  it('Test10: Should prevent transfer to self', async () => {
    const owner = await blockchain.treasury('deployer')
    const result = await counter.sendTransferOwnership(owner.getSender(), {
      value: toNano('0.05'),
      newOwner: owner.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: counter.address,
      exitCode: ERROR_CANNOT_TRANSFER_TO_SELF,
      success: false,
    })
  })
})
