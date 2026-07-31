import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'

import { ContextExecutor } from '../../wrappers/gen/ccip/ContextExecutor'

describe('ContextExecutor', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let forwarder: SandboxContract<TreasuryContract>
  let executor: SandboxContract<ContextExecutor>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    owner = await blockchain.treasury('owner')
    forwarder = await blockchain.treasury('forwarder')

    executor = blockchain.openContract(
      ContextExecutor.fromStorage({
        id: 77n,
        owner: owner.address,
        context: Cell.EMPTY,
        forwardFrom: [forwarder.address],
      }),
    )

    await executor.sendDeploy(owner.getSender(), toNano('0.05'))
  })

  it('derives distinct addresses for distinct ids with identical context', () => {
    const first = ContextExecutor.fromStorage({
      id: 1n,
      owner: owner.address,
      context: Cell.EMPTY,
      forwardFrom: [forwarder.address],
    })
    const second = ContextExecutor.fromStorage({
      id: 2n,
      owner: owner.address,
      context: Cell.EMPTY,
      forwardFrom: [forwarder.address],
    })

    expect(first.address.equals(second.address)).toBe(false)
  })

  it('forwards at most one notification from an authorized sender', async () => {
    const first = await forwarder.send({
      to: executor.address,
      value: toNano('0.02'),
      bounce: false,
      body: Cell.EMPTY,
    })

    expect(first.transactions).toHaveTransaction({
      from: forwarder.address,
      to: executor.address,
      success: true,
    })
    expect(first.transactions).toHaveTransaction({
      from: executor.address,
      to: owner.address,
      success: true,
    })

    const second = await forwarder.send({
      to: executor.address,
      value: toNano('0.02'),
      bounce: false,
      body: Cell.EMPTY,
    })

    const repeatedNotifications = second.transactions.filter(
      (tx: any) =>
        tx.inMessage?.info?.src?.equals?.(executor.address) &&
        tx.inMessage?.info?.dest?.equals?.(owner.address),
    )

    expect(repeatedNotifications).toHaveLength(0)
  })
})
