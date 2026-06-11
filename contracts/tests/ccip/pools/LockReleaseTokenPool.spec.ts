import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import { JettonMinter, JettonSender, JettonWallet } from '../../../wrappers/examples/jetton'
import {
  LockReleaseTokenPool,
  codec as poolCodec,
  opcodes as poolOpcodes,
} from '../../../wrappers/ccip/LockReleaseTokenPool'
import * as jetton from '../../../wrappers/jetton/JettonCode'
import { runTokenPoolBehaviorTests } from './TokenPool.behavior'
import { TokenPool } from '../../../wrappers/gen/ccip/pools/TokenPool'
import { setupGenBindings } from '../../../wrappers/gen'

describe('LockReleaseTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonSender: SandboxContract<JettonSender>
  let lockReleasePool: SandboxContract<LockReleaseTokenPool>
  let pool: SandboxContract<TokenPool>
  let jettonWalletCode: Cell

  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  const remoteChainSelector = 90000001n
  const sourcePoolAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('source-pool'))
  const destTokenAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('dest-token'))
  const receiverAddress = poolCodec.crossChainAddressFromBuffer(Buffer.from('receiver'))

  beforeAll(async () => {
    setupGenBindings()
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    offRamp = await blockchain.treasury('offramp')
    recipient = await blockchain.treasury('recipient')

    jettonWalletCode = await jetton.JettonWalletCode()
    const jettonMinterCode = await jetton.JettonMinterCode()

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode: jettonWalletCode,
          jettonContent: beginCell().storeStringTail('pool-test').endCell(),
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )
    await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    const jettonSenderCode = await JettonSender.code()
    jettonSender = blockchain.openContract(
      JettonSender.createFromConfig(
        {
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode,
          },
        },
        jettonSenderCode,
      ),
    )
    await jettonSender.sendDeploy(deployer.getSender(), toNano('1'))

    const poolCode = await LockReleaseTokenPool.code()
    lockReleasePool = blockchain.openContract(
      LockReleaseTokenPool.createFromConfig(
        {
          owner: deployer.address,
          token: jettonMinter.address,
          tokenDecimals: 9,
          rmnProxy: deployer.address,
          router: deployer.address,
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode,
          },
        },
        poolCode,
      ),
    )
    await lockReleasePool.sendDeploy(deployer.getSender(), toNano('2'))

    // Standard TokenPool interface
    pool = blockchain.openContract(TokenPool.fromAddress(lockReleasePool.address))

    const applyChains = await lockReleasePool.sendApplyChainUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 1n,
        remove: [],
        add: [
          {
            remoteChainSelector,
            remotePoolAddresses: [sourcePoolAddress],
            remoteTokenAddress: destTokenAddress,
            outboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
            inboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
          },
        ],
      },
    )

    expect(applyChains.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    const updateRampAccess = await lockReleasePool.sendUpdateRampAccess(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 2n,
        updates: [
          {
            remoteChainSelector,
            onRamp: jettonSender.address,
            offRamp: offRamp.address,
          },
        ],
      },
    )

    expect(updateRampAccess.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    const mintToOnRamp = await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: jettonSender.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    expect(mintToOnRamp.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      success: true,
    })

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
      )
    }
  })

  runTokenPoolBehaviorTests('LockReleaseTokenPool', async () => ({
    pool,
    deployer,
    offRamp,
    altOffRamp: deployer,
    unauthorized: recipient,
    recipient,
    remoteChainSelector,
    unsupportedChainSelector: remoteChainSelector + 1n,
    unknownSourcePoolAddress: poolCodec.crossChainAddressFromBuffer(
      Buffer.from('unknown-source-pool'),
    ),
    remoteTokenAddress: destTokenAddress,
    onRampAddress: jettonSender.address,
    destTokenAddress,
    sourcePoolAddress,
    localToken: jettonMinter.address,
  }))

  it('has no pending release by default', async () => {
    expect(await lockReleasePool.getHasPendingRelease(999n)).toBe(false)
  })

  it('reverts lockOrBurn when forwarded amount does not match transfer amount', async () => {
    const onRampWallet = await userWallet(jettonSender.address)
    const poolWallet = await userWallet(lockReleasePool.address)

    const result = await jettonSender.sendJettonsExtended(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 44n,
        amount: toNano('3'),
        destination: lockReleasePool.address,
        customPayload: beginCell().storeBit(1).endCell(),
        forwardTonAmount: toNano('0.2'),
        forwardPayload: poolCodec.lockOrBurnPayload
          .encode({
            queryId: 44n,
            request: {
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('2'),
              localToken: jettonMinter.address,
            },
            requestedFinalityConfig: 0,
            tokenArgs: null,
            replyTo: deployer.address,
          })
          .endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: lockReleasePool.address,
      success: false,
    })
  })

  it('reverts lockOrBurn when forward payload is malformed', async () => {
    const onRampWallet = await userWallet(jettonSender.address)
    const poolWallet = await userWallet(lockReleasePool.address)

    const result = await jettonSender.sendJettonsExtended(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 45n,
        amount: toNano('1'),
        destination: lockReleasePool.address,
        customPayload: beginCell().storeBit(1).endCell(),
        forwardTonAmount: toNano('0.2'),
        forwardPayload: beginCell().storeUint(0, 32).endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: lockReleasePool.address,
      success: false,
    })
  })

  it('reverts releaseOrMint when requested amount exceeds pool liquidity', async () => {
    const result = await lockReleasePool.sendReleaseOrMint(offRamp.getSender(), toNano('0.4'), {
      queryId: 46n,
      request: {
        originalSender: sourcePoolAddress,
        remoteChainSelector,
        receiver: recipient.address,
        sourceDenominatedAmount: toNano('999999'),
        localToken: jettonMinter.address,
        sourcePoolAddress,
        sourcePoolData: null,
        offchainTokenData: null,
      },
      requestedFinalityConfig: 0,
      replyTo: deployer.address,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: lockReleasePool.address,
      success: false,
    })
    expect(await lockReleasePool.getHasPendingRelease(46n)).toBe(false)
  })

  it('locks tokens through a jetton transfer notification and credits the pool wallet', async () => {
    const onRampWallet = await userWallet(jettonSender.address)
    const poolWallet = await userWallet(lockReleasePool.address)

    const result = await jettonSender.sendJettonsExtended(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 11n,
        amount: toNano('3'),
        destination: lockReleasePool.address,
        customPayload: beginCell().storeBit(1).endCell(),
        forwardTonAmount: toNano('0.2'),
        forwardPayload: poolCodec.lockOrBurnPayload
          .encode({
            queryId: 11n,
            request: {
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('3'),
              localToken: jettonMinter.address,
            },
            requestedFinalityConfig: 0,
            tokenArgs: null,
            replyTo: deployer.address,
          })
          .endCell(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: jettonSender.address,
      to: onRampWallet.address,
      success: true,
    })

    expect(await poolWallet.getJettonBalance()).toEqual(toNano('3'))
  })

  it('releases tokens from pool custody after off-ramp request and clears pending state on confirmation', async () => {
    const poolWallet = await userWallet(lockReleasePool.address)
    const recipientWallet = await userWallet(recipient.address)

    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: lockReleasePool.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('5'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    const result = await lockReleasePool.sendReleaseOrMint(offRamp.getSender(), toNano('0.4'), {
      queryId: 22n,
      request: {
        originalSender: sourcePoolAddress,
        remoteChainSelector,
        receiver: recipient.address,
        sourceDenominatedAmount: toNano('2'),
        localToken: jettonMinter.address,
        sourcePoolAddress,
        sourcePoolData: null,
        offchainTokenData: null,
      },
      requestedFinalityConfig: 0,
      replyTo: deployer.address,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: lockReleasePool.address,
      success: true,
    })

    expect(await recipientWallet.getJettonBalance()).toEqual(toNano('2'))
    expect(await poolWallet.getJettonBalance()).toEqual(toNano('3'))
    expect(await lockReleasePool.getHasPendingRelease(22n)).toBe(false)

    expect(result.transactions).toHaveTransaction({
      from: lockReleasePool.address,
      to: deployer.address,
      success: true,
      op: poolOpcodes.out.releaseOrMintResponse,
      body(body) {
        if (!body) return false
        const response = poolCodec.releaseOrMintResponse.load(body.beginParse())
        return response.queryId === 22n && response.destinationAmount === toNano('2')
      },
    })
  })

  it('mirrors cursed state locally and blocks release while cursed', async () => {
    const curseUpdate = await lockReleasePool.sendUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.2'),
      { queryId: 901n, cursedSubjects: [remoteChainSelector] },
    )

    expect(curseUpdate.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    expect(await lockReleasePool.getVerifyNotCursed(remoteChainSelector)).toBe(false)

    const result = await lockReleasePool.sendReleaseOrMint(offRamp.getSender(), toNano('0.3'), {
      queryId: 33n,
      request: {
        originalSender: sourcePoolAddress,
        remoteChainSelector,
        receiver: recipient.address,
        sourceDenominatedAmount: 1n,
        localToken: jettonMinter.address,
        sourcePoolAddress,
        sourcePoolData: null,
        offchainTokenData: null,
      },
      requestedFinalityConfig: 0,
      replyTo: deployer.address,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: lockReleasePool.address,
      success: false,
    })
  })
})
