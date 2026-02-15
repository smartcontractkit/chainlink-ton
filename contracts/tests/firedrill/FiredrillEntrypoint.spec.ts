import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { FiredrillEntrypoint } from '../../wrappers/firedrill/FiredrillEntrypoint'
import { FiredrillOnRamp } from '../../wrappers/firedrill/FiredrillOnRamp'
import { FiredrillOffRamp } from '../../wrappers/firedrill/FiredrillOffRamp'
import { setupFiredrill, CHAINSEL_TON_TEST, tonAddressToCrossChainAddress } from './Firedrill.Setup'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'

describe('FiredrillEntrypoint - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let entrypoint: SandboxContract<FiredrillEntrypoint>
  let onramp: SandboxContract<FiredrillOnRamp>
  let offramp: SandboxContract<FiredrillOffRamp>
  let tokenAddress: any

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true
  })

  beforeEach(async () => {
    const setup = await setupFiredrill(blockchain)
    deployer = setup.deployer
    entrypoint = setup.entrypoint
    onramp = setup.onramp
    offramp = setup.offramp
    tokenAddress = setup.tokenAddress
  })

  it('should deploy successfully', async () => {
    expect(entrypoint.address).toBeDefined()
  })

  it('getChainSelector should return chain selector', async () => {
    const result = await entrypoint.getChainSelector()
    expect(result).toBe(CHAINSEL_TON_TEST)
  })

  it('getTokenAddress should return token address', async () => {
    const result = await entrypoint.getTokenAddress()
    expect(result.equals(tokenAddress)).toBe(true)
  })

  it('getOnRampAddress should return onramp address', async () => {
    const result = await entrypoint.getOnRampAddress()
    expect(result.equals(onramp.address)).toBe(true)
  })

  it('getOffRampAddress should return offramp address', async () => {
    const result = await entrypoint.getOffRampAddress()
    expect(result.equals(offramp.address)).toBe(true)
  })

  it('getOwner should return deployer address', async () => {
    const result = await entrypoint.getOwner()
    expect(result.equals(deployer.address)).toBe(true)
  })

  it('getPendingOwner should return null initially', async () => {
    const result = await entrypoint.getPendingOwner()
    expect(result).toBeNull()
  })

  // Router getter tests
  it('getOnRamp should return onramp address for any destination chain', async () => {
    const result = await entrypoint.getOnRamp(12345n)
    expect(result.equals(onramp.address)).toBe(true)
  })

  it('getOffRamp should return offramp address for any source chain', async () => {
    const result = await entrypoint.getOffRamp(12345n)
    expect(result.equals(offramp.address)).toBe(true)
  })

  it('getOnRamps should return onramps list', async () => {
    const result = await entrypoint.getOnRamps()
    expect(result.destChainSelectors).toHaveLength(1)
    expect(result.destChainSelectors[0]).toBe(CHAINSEL_TON_TEST)
    expect(result.onRamp.equals(onramp.address)).toBe(true)
  })

  it('getOffRamps should return offramps list', async () => {
    const result = await entrypoint.getOffRamps()
    expect(result.sourceChainSelectors).toHaveLength(1)
    expect(result.sourceChainSelectors[0]).toBe(CHAINSEL_TON_TEST)
    expect(result.offRamp.equals(offramp.address)).toBe(true)
  })

  // FeeQuoter getter tests
  it('getStaticConfig should return fee quoter configuration', async () => {
    const result = await entrypoint.getStaticConfig()
    expect(result.maxFeeJuelsPerMsg).toBe(1n)
    expect(result.linkToken.equals(tokenAddress)).toBe(true)
    expect(result.tokenPriceStalenessThreshold).toBe(0n)
  })

  it('getTokenPrice should return mock price', async () => {
    const result = await entrypoint.getTokenPrice(tokenAddress)
    expect(result.value).toBe(1n)
    expect(result.timestamp).toBe(0n)
  })

  it('getDestinationChainGasPrice should return mock gas prices', async () => {
    const result = await entrypoint.getDestinationChainGasPrice(12345n)
    expect(result.executionGasPrice).toBe(1n)
    expect(result.dataAvailabilityGasPrice).toBe(1n)
    expect(result.timestamp).toBe(0n)
  })

  // Drill function tests
  it('should allow owner to prepare register', async () => {
    const result = await entrypoint.sendPrepareRegister(deployer.getSender(), toNano('0.5'))

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })

    // Should send message to offramp
    expect(result.transactions).toHaveTransaction({
      from: entrypoint.address,
      to: offramp.address,
      success: true,
    })
  })

  it('should reject prepare register from non-owner', async () => {
    const other = await blockchain.treasury('other')
    const result = await entrypoint.sendPrepareRegister(other.getSender(), toNano('0.5'))

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: entrypoint.address,
      success: false,
    })
  })

  it('should allow owner to drill pending commit', async () => {
    const from = 1n
    const to = 5n

    const result = await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(
      deployer.getSender(),
      {
        value: toNano('1.0'),
        from,
        to,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })

    // Should send messages to onramp (5 messages for sequence 1-5)
    const onrampTransactions = result.transactions.filter(
      (tx) =>
        tx.inMessage?.info.type === 'internal' && tx.inMessage.info.dest.equals(onramp.address),
    )
    expect(onrampTransactions.length).toBeGreaterThan(0)
  })

  it('should reject drill pending commit with invalid range (from > to)', async () => {
    const from = 10n
    const to = 5n

    const result = await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(
      deployer.getSender(),
      {
        value: toNano('1.0'),
        from,
        to,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: false,
      exitCode: 3001, // NothingToSend
    })
  })

  it('should reject drill pending commit if messages already sent', async () => {
    // Send first batch
    await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(deployer.getSender(), {
      value: toNano('1.0'),
      from: 1n,
      to: 5n,
    })

    // Try to send overlapping batch
    const result = await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(
      deployer.getSender(),
      {
        value: toNano('1.0'),
        from: 3n, // Overlaps with previous
        to: 10n,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: false,
      exitCode: 3002, // MessageAlreadySent
    })
  })

  it('should allow owner to drill pending execution', async () => {
    // First send some messages
    await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(deployer.getSender(), {
      value: toNano('1.0'),
      from: 1n,
      to: 10n,
    })

    // Then trigger execution
    const result = await entrypoint.sendDrillPendingExecution(deployer.getSender(), {
      value: toNano('0.5'),
      from: 1n,
      to: 10n,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })

    // Should send message to offramp
    expect(result.transactions).toHaveTransaction({
      from: entrypoint.address,
      to: offramp.address,
      success: true,
    })

    // Assert CommitReportAccepted log was emitted by offramp
    assertLog(result.transactions, offramp.address, LogTypes.CommitReportAccepted, {
      merkleRoot: {
        sourceChainSelector: CHAINSEL_TON_TEST,
        minSeqNr: 1n,
        maxSeqNr: 10n,
      },
    })
  })

  it('should reject drill pending execution if messages not sent yet', async () => {
    const result = await entrypoint.sendDrillPendingExecution(deployer.getSender(), {
      value: toNano('0.5'),
      from: 1n,
      to: 10n,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: false,
      exitCode: 3003, // NotYetSent
    })
  })

  it('should allow owner to drill price registries', async () => {
    const result = await entrypoint.sendDrillPriceRegistries(deployer.getSender(), toNano('0.5'))

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })

    // Assert UsdPerTokenUpdated event was emitted
    assertLog(result.transactions, entrypoint.address, LogTypes.UsdPerUnitGasUpdated, {
      destChainSelector: CHAINSEL_TON_TEST, // uint64
      executionGasPrice: 1n, // uint112
      dataAvailabilityGasPrice: 1n, // uint112
    })
  })

  it('should reject drill price registries from non-owner', async () => {
    const other = await blockchain.treasury('other')
    const result = await entrypoint.sendDrillPriceRegistries(other.getSender(), toNano('0.5'))

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: entrypoint.address,
      success: false,
    })
  })

  it('should execute complete firedrill flow', async () => {
    // 1. Prepare register
    const prepareResult = await entrypoint.sendPrepareRegister(deployer.getSender(), toNano('0.5'))
    expect(prepareResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })
    assertLog(prepareResult.transactions, offramp.address, LogTypes.SourceChainConfigUpdated, {
      sourceChainSelector: CHAINSEL_TON_TEST,
      config: {
        router: entrypoint.address,
        isEnabled: true,
        minSeqNr: 0n,
        isRMNVerificationDisabled: false,
        onRamp: tonAddressToCrossChainAddress(onramp.address),
      },
    })

    // 2. Send messages (drill pending commit)
    const sendResult = await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(
      deployer.getSender(),
      {
        value: toNano('1.0'),
        from: 1n,
        to: 3n,
      },
    )
    expect(sendResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })
    expect(sendResult.transactions).not.toHaveTransaction({
      from: entrypoint.address,
      to: onramp.address,
      success: false,
    })
    // Verify CCIPMessageSent events for each sequence number
    assertLog(sendResult.transactions, onramp.address, LogTypes.CCIPMessageSent, {
      message: {
        sender: entrypoint.address,
        header: {
          sequenceNumber: 1n,
        },
      },
    })
    assertLog(sendResult.transactions, onramp.address, LogTypes.CCIPMessageSent, {
      message: {
        sender: entrypoint.address,
        header: {
          sequenceNumber: 2n,
        },
      },
    })
    assertLog(sendResult.transactions, onramp.address, LogTypes.CCIPMessageSent, {
      message: {
        sender: entrypoint.address,
        header: {
          sequenceNumber: 3n,
        },
      },
    })

    // 3. Execute messages (drill pending execution)
    const executeResult = await entrypoint.sendDrillPendingExecution(deployer.getSender(), {
      value: toNano('0.5'),
      from: 1n,
      to: 3n,
    })
    expect(executeResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: entrypoint.address,
      success: true,
    })
    assertLog(executeResult.transactions, offramp.address, LogTypes.CommitReportAccepted, {
      merkleRoot: {
        sourceChainSelector: CHAINSEL_TON_TEST,
        minSeqNr: 1n,
        maxSeqNr: 3n,
      },
    })
  })
})
