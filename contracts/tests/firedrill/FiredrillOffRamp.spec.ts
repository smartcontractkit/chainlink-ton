import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { FiredrillOffRamp } from '../../wrappers/firedrill/FiredrillOffRamp'
import { deployFiredrillOffRamp, CHAINSEL_TON_TEST } from './Firedrill.Setup'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'

describe('FiredrillOffRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offramp: SandboxContract<FiredrillOffRamp>
  let onRampAddress: any

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true
  })

  beforeEach(async () => {
    deployer = await blockchain.treasury('deployer')
    const deployment = await deployFiredrillOffRamp(blockchain, deployer)
    offramp = deployment.offramp
    onRampAddress = deployment.config.onRampAddress
  })

  it('should deploy successfully', async () => {
    expect(offramp.address).toBeDefined()
  })

  it('getConfig should return configuration', async () => {
    const result = await offramp.getConfig()
    expect(result.chainSelector).toEqual(CHAINSEL_TON_TEST)
    expect(result.feeQuoter.equals(deployer.address)).toBe(true)
    expect(result.permissionlessExecutionThresholdSeconds).toBe(10)
  })

  it('getSourceChainConfig should return source chain configuration', async () => {
    const sourceChainSelector = 12345n
    const result = await offramp.getSourceChainConfig(sourceChainSelector)
    expect(result.router.equals(deployer.address)).toBe(true)
    expect(result.isEnabled).toBe(true)
    expect(result.minSeqNr).toBe(0n)
    expect(result.isRMNVerificationDisabled).toBe(false)
    expect(result.onRamp).toBeDefined()
  })

  it('should emit SourceChainConfigSet when triggered by control address', async () => {
    const result = await offramp.sendEmitSourceChainConfigSet(deployer.getSender(), toNano('0.1'))

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offramp.address,
      success: true,
    })

    // Check that the event was emitted
    const events = result.events
    expect(events.length).toBeGreaterThan(0)
  })

  it('should reject emit from non-control address', async () => {
    const other = await blockchain.treasury('other')

    const result = await offramp.sendEmitSourceChainConfigSet(other.getSender(), toNano('0.1'))

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: offramp.address,
      success: false,
      exitCode: 100, // Unauthorized
    })
  })

  it('should emit CommitReportAccepted when triggered by control address', async () => {
    const minSeqNr = 1n
    const maxSeqNr = 10n

    const result = await offramp.sendEmitCommitReportAccepted(deployer.getSender(), {
      value: toNano('0.1'),
      minSeqNr,
      maxSeqNr,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offramp.address,
      success: true,
    })

    // Assert CommitReportAccepted log was emitted
    assertLog(result.transactions, offramp.address, LogTypes.CommitReportAccepted, {
      merkleRoot: {
        sourceChainSelector: CHAINSEL_TON_TEST,
        minSeqNr,
        maxSeqNr,
      },
    })
  })

  it('should reject CommitReportAccepted from non-control address', async () => {
    const other = await blockchain.treasury('other')
    const minSeqNr = 1n
    const maxSeqNr = 10n

    const result = await offramp.sendEmitCommitReportAccepted(other.getSender(), {
      value: toNano('0.1'),
      minSeqNr,
      maxSeqNr,
    })

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: offramp.address,
      success: false,
      exitCode: 100, // Unauthorized
    })
  })

  it('should emit CommitReportAccepted with different sequence ranges', async () => {
    const ranges = [
      { minSeqNr: 1n, maxSeqNr: 5n },
      { minSeqNr: 6n, maxSeqNr: 10n },
      { minSeqNr: 11n, maxSeqNr: 20n },
    ]

    for (const range of ranges) {
      const result = await offramp.sendEmitCommitReportAccepted(deployer.getSender(), {
        value: toNano('0.1'),
        ...range,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offramp.address,
        success: true,
      })

      // Assert CommitReportAccepted log was emitted with correct range
      assertLog(result.transactions, offramp.address, LogTypes.CommitReportAccepted, {
        merkleRoot: {
          sourceChainSelector: CHAINSEL_TON_TEST,
          minSeqNr: range.minSeqNr,
          maxSeqNr: range.maxSeqNr,
        },
      })
    }
  })
})
