import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as callProxy from '../../wrappers/mcms/CallProxy'

describe('CallProxy', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let mockTarget: SandboxContract<TreasuryContract>
  let bind: {
    callProxy: SandboxContract<callProxy.ContractClient>
  }
  let code: Cell

  // Mock target address - using a treasury contract as target
  const MOCK_TARGET_ID = 0x13371337

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    code = await compile('mcms.CallProxy')
    deployer = await blockchain.treasury('deployer')
    mockTarget = await blockchain.treasury('mockTarget')

    bind = {
      callProxy: blockchain.openContract(
        callProxy.ContractClient.newFrom(
          {
            id: MOCK_TARGET_ID,
            target: mockTarget.address,
          },
          code,
        ),
      ),
    }

    const deployResult = await bind.callProxy.sendInternal(
      deployer.getSender(),
      toNano('0.05'),
      callProxy.builder.message.in.topUp.encode({ queryId: 1n }), // TopUp message to deploy
    )

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      deploy: true,
      success: true,
    })
  })

  it('Should compute crc32 opcodes', async () => {
    // In opcodes
    expect(callProxy.opcodes.in.TopUp).toBe(0x3b3d63b8)
  })

  it('should deploy and set target correctly', async () => {
    // Verify the contract deployed successfully
    expect(bind.callProxy.address).toBeDefined()

    // Verify the target was set correctly
    const target = await bind.callProxy.getTarget()
    expect(target.equals(mockTarget.address)).toBe(true)

    // Verify the ID was set correctly
    const id = await bind.callProxy.getID()
    expect(id).toBe(MOCK_TARGET_ID)
  })

  it('should limit excess top-up', async () => {
    const r = await bind.callProxy.sendInternal(
      deployer.getSender(),
      toNano('100.05'),
      callProxy.builder.message.in.topUp.encode({ queryId: 1n }),
    )

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      exitCode: callProxy.Errors.ValueOutOfBounds,
    })

    const r1 = await bind.callProxy.sendInternal(
      deployer.getSender(),
      toNano('0.05'),
      callProxy.builder.message.in.topUp.encode({ queryId: 1n }),
    )

    expect(r1.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      success: true,
    })

    const r2 = await bind.callProxy.sendInternal(
      deployer.getSender(),
      toNano('0.08'),
      callProxy.builder.message.in.topUp.encode({ queryId: 1n }),
    )

    expect(r2.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      success: true,
    })

    const r3 = await bind.callProxy.sendInternal(
      deployer.getSender(),
      toNano('0.08'),
      callProxy.builder.message.in.topUp.encode({ queryId: 1n }),
    )

    expect(r3.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      exitCode: callProxy.Errors.ContractMaxFunded,
    })
  })

  it('should forward messages to target', async () => {
    // Create a test message body
    const testBody = beginCell()
      .storeUint(0x12345678, 32) // Some test op code
      .storeUint(42, 32) // Some test data
      .endCell()

    // Send a message to the CallProxy
    const result = await bind.callProxy.sendInternal(deployer.getSender(), toNano('1'), testBody)

    // Verify the CallProxy received the message successfully
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      success: true,
    })

    // Verify the message was forwarded to the target
    expect(result.transactions).toHaveTransaction({
      from: bind.callProxy.address,
      to: mockTarget.address,
      body: testBody,
    })
  })

  it('should forward messages with different values', async () => {
    const testValues = [toNano('0.1'), toNano('1'), toNano('10')]

    for (const testValue of testValues) {
      const testBody = beginCell()
        .storeUint(0x87654321, 32) // Different test op code
        .storeUint(testValue, 64) // Store the test value
        .endCell()

      const result = await bind.callProxy.sendInternal(deployer.getSender(), testValue, testBody)

      // Verify the CallProxy received the message successfully
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: bind.callProxy.address,
        success: true,
      })

      // Verify the message was forwarded to the target
      // Note: The forwarded value will be less than the original due to gas fees
      expect(result.transactions).toHaveTransaction({
        from: bind.callProxy.address,
        to: mockTarget.address,
        body: testBody,
      })
    }
  })

  it('should forward empty messages', async () => {
    const emptyBody = Cell.EMPTY

    const result = await bind.callProxy.sendInternal(deployer.getSender(), toNano('0.5'), emptyBody)

    // Verify the CallProxy received the message successfully
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.callProxy.address,
      success: true,
    })

    // Verify the empty message was forwarded to the target
    expect(result.transactions).toHaveTransaction({
      from: bind.callProxy.address,
      to: mockTarget.address,
      body: emptyBody,
    })
  })

  it('should forward messages from different senders', async () => {
    const sender1 = await blockchain.treasury('sender1')
    const sender2 = await blockchain.treasury('sender2')
    const senders = [sender1, sender2]

    for (let i = 0; i < senders.length; i++) {
      const sender = senders[i]
      const testBody = beginCell()
        .storeUint(0xaaaabbbb, 32)
        .storeUint(i, 32) // Different data for each sender
        .endCell()

      const result = await bind.callProxy.sendInternal(sender.getSender(), toNano('0.7'), testBody)

      // Verify the CallProxy received the message successfully
      expect(result.transactions).toHaveTransaction({
        from: sender.address,
        to: bind.callProxy.address,
        success: true,
      })

      // Verify the message was forwarded to the target
      expect(result.transactions).toHaveTransaction({
        from: bind.callProxy.address,
        to: mockTarget.address,
        body: testBody,
      })
    }
  })

  describe('constructor variations', () => {
    it('should create CallProxy with different targets', async () => {
      const target1 = await blockchain.treasury('target1')
      const target2 = await blockchain.treasury('target2')
      const targets = [target1, target2]

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        const testId = 1000 + i

        const callProxyInstance = blockchain.openContract(
          callProxy.ContractClient.newFrom(
            {
              id: testId,
              target: target.address,
            },
            code,
          ),
        )

        const deployResult = await callProxyInstance.sendInternal(
          deployer.getSender(),
          toNano('0.05'),
          Cell.EMPTY,
        )

        expect(deployResult.transactions).toHaveTransaction({
          from: deployer.address,
          to: callProxyInstance.address,
          deploy: true,
          success: true,
        })

        // Verify the target was set correctly
        const actualTarget = await callProxyInstance.getTarget()
        expect(actualTarget.equals(target.address)).toBe(true)

        // Verify the ID was set correctly
        const actualId = await callProxyInstance.getID()
        expect(actualId).toBe(testId)
      }
    })
  })
})
