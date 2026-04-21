import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { FiredrillOnRamp, Opcodes } from '../../wrappers/firedrill/FiredrillOnRamp'
import { deployFiredrillOnRamp, CHAINSEL_TON_TEST } from './Firedrill.Setup'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'

describe('FiredrillOnRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<FiredrillOnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true
  })

  beforeEach(async () => {
    deployer = await blockchain.treasury('deployer')
    const deployment = await deployFiredrillOnRamp(blockchain, deployer)
    onramp = deployment.onramp
  })

  it('should deploy successfully', async () => {
    expect(onramp.address).toBeDefined()
  })

  it('getStaticConfig should return chain selector', async () => {
    const result = await onramp.getStaticConfig()
    expect(result).toBe(CHAINSEL_TON_TEST)
  })

  it('getDynamicConfig should return configuration', async () => {
    const result = await onramp.getDynamicConfig()
    expect(result.feeQuoter).toEqual(deployer.address)
    expect(result.feeAggregator).toEqual(deployer.address)
    expect(result.allowlistAdmin).toEqual(deployer.address)
    expect(result.reserve).toBe(0n)
  })

  it('getDestChainConfig should return destination config', async () => {
    const destChainSelector = 12345n
    const result = await onramp.getDestChainConfig(destChainSelector)
    expect(result.router).toEqual(deployer.address)
    expect(result.sequenceNumber).toBe(0n)
    expect(result.allowlistEnabled).toBe(false)
  })

  it('should emit CCIPMessageSent when triggered by control address', async () => {
    const sender = deployer.address
    const sequenceNumber = 1n

    const result = await onramp.sendEmitCCIPMessageSent(deployer.getSender(), {
      value: toNano('0.1'),
      sender,
      sequenceNumber,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    // Assert CCIPMessageSent log was emitted
    assertLog(result.transactions, onramp.address, LogTypes.CCIPMessageSent, {
      message: {
        sender,
        header: {
          sequenceNumber,
        },
      },
    })
  })

  it('should reject emit from non-control address', async () => {
    const other = await blockchain.treasury('other')
    const sender = deployer.address
    const sequenceNumber = 1n

    const result = await onramp.sendEmitCCIPMessageSent(other.getSender(), {
      value: toNano('0.1'),
      sender,
      sequenceNumber,
    })

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: onramp.address,
      success: false,
      exitCode: 100, // Unauthorized
    })
  })

  it('should emit multiple CCIPMessageSent events with different sequence numbers', async () => {
    const sender = deployer.address

    for (let i = 1; i <= 3; i++) {
      const result = await onramp.sendEmitCCIPMessageSent(deployer.getSender(), {
        value: toNano('0.1'),
        sender,
        sequenceNumber: BigInt(i),
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })
    }
  })
})
