import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, Dictionary, toNano } from '@ton/core'
import { createEmptyTensorValue, loadMap } from '../../../src/utils/dict'
import { JettonMinter, JettonSender, JettonWallet } from '../../../wrappers/examples/jetton'
import * as jetton from '../../../wrappers/jetton/JettonCode'
import {
  CrossChainAddress,
  CursedSubjects,
  RateLimiter_Config,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_DynamicConfig,
  TokenPool_MirroredPolicy,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnInV1,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_RateLimitConfigPair,
  TokenPool_RampUpdate,
  TokenPool_ChainUpdate,
  Ownable2Step,
  TokenPool_TransferDetails,
  TokenPool_LockOrBurnTransfer,
  TokenPool_Transfer,
  TokenPool_ReleaseOrMintTransfer,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import {
  JettonClient,
  LockReleaseTokenPool,
} from '../../../wrappers/gen/ccip/pools/LockReleaseTokenPool'
import { setupGenBindings } from '../../../wrappers/gen'

import * as rtOld from '../../../wrappers/ccip/Router'
import { runTokenPoolBehaviorTests, runTokenPoolAsyncHookBehaviorTests } from './TokenPool.behavior'
import { asSnakedCell, asSnakedCellEmpty } from '../../../src/utils'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'

function crossChainAddressFromBuffer(buffer: Buffer): CrossChainAddress {
  const addrSlice = rtOld.builder.data.crossChainAddress.encode(buffer).asSlice()
  return CrossChainAddress.fromSlice(addrSlice)
}

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

  let sourcePoolAddress: CrossChainAddress
  let destTokenAddress: CrossChainAddress
  let receiverAddress: CrossChainAddress

  beforeAll(async () => {
    setupGenBindings()

    sourcePoolAddress = crossChainAddressFromBuffer(Buffer.from('source-pool'))
    destTokenAddress = crossChainAddressFromBuffer(Buffer.from('dest-token'))
    receiverAddress = crossChainAddressFromBuffer(Buffer.from('receiver'))
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

    lockReleasePool = blockchain.openContract(
      LockReleaseTokenPool.fromStorage({
        poolData: {
          ref: TokenPool_Data.create({
            adminConfig: {
              ref: TokenPool_AdminConfig.create({
                ownable: {
                  ref: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
                },
                rmnProxy: deployer.address,
                dynamicConfig: {
                  ref: TokenPool_DynamicConfig.create({
                    router: deployer.address,
                    rateLimitAdmin: null,
                    feeAdmin: null,
                  }),
                },
                jettonClient: JettonClient.create({
                  masterAddress: jettonMinter.address,
                  jettonWalletCode,
                }),
                allowedFinalityConfig: 0n,
                advancedPoolHooks: null,
              }),
            },
            mirroredPolicy: {
              ref: TokenPool_MirroredPolicy.create({
                onRamps: Dictionary.empty(Dictionary.Keys.BigInt(64)),
                offRamps: Dictionary.empty(Dictionary.Keys.BigInt(64)),
                cursedSubjects: CursedSubjects.create({
                  data: Dictionary.empty(Dictionary.Keys.BigInt(128)),
                }),
              }),
            },
            tokenDecimals: 9n,
            remoteChainConfigs: Dictionary.empty(Dictionary.Keys.BigInt(64)),
            tokenTransferFeeConfigs: Dictionary.empty(Dictionary.Keys.BigInt(64)),
          }),
        },
        pendingReleases: Dictionary.empty(Dictionary.Keys.BigInt(64)),
      }),
    )
    await lockReleasePool.sendDeploy(deployer.getSender(), toNano('2'))

    // Standard TokenPool interface
    pool = blockchain.openContract(TokenPool.fromAddress(lockReleasePool.address))

    const applyChains = await lockReleasePool.sendTokenPoolApplyChainUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 1n,
        remoteChainSelectorsToRemove: asSnakedCellEmpty<bigint>(),
        chainsToAdd: asSnakedCell(
          [
            TokenPool_ChainUpdate.create({
              remoteChainSelector,
              remotePoolAddresses: asSnakedCell([sourcePoolAddress], (item) => {
                let b = beginCell()
                CrossChainAddress.store(item, b)
                return b
              }),
              remoteTokenAddress: { ref: destTokenAddress },
              rateLimitConfigs: {
                ref: TokenPool_RateLimitConfigPair.create({
                  outbound: {
                    ref: RateLimiter_Config.create({
                      isEnabled: true,
                      capacity: toNano('100'),
                      rate: 1n,
                    }),
                  },
                  inbound: {
                    ref: RateLimiter_Config.create({
                      isEnabled: true,
                      capacity: toNano('100'),
                      rate: 1n,
                    }),
                  },
                }),
              },
            }),
          ],
          (item) => TokenPool_ChainUpdate.toCell(item).asBuilder(),
        ),
      },
    )

    expect(applyChains.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    const updateRampAccess = await lockReleasePool.sendTokenPoolUpdateRampAccess(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 2n,
        updates: asSnakedCell(
          [
            TokenPool_RampUpdate.create({
              remoteChainSelector,
              onRamp: deployer.address,
              offRamp: offRamp.address,
            }),
          ],
          (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
        ),
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
    unauthorized: recipient,
    recipient,
    remoteChainSelector,
    onRampAddress: deployer.address,
    destTokenAddress,
    sourcePoolAddress,
    localToken: jettonMinter.address,
  }))

  // Async hook behavior tests (TON-TP/6)
  runTokenPoolAsyncHookBehaviorTests('LockReleaseTokenPool', async () => {
    // Deploy mock hooks
    const hooks = blockchain.openContract(MockAdvancedPoolHooks.fromStorage({ id: 0n }))
    await hooks.sendDeploy(deployer.getSender(), toNano('0.1'))

    // Register hooks on pool
    const setHooksResult = await pool.sendTokenPoolSetAdvancedPoolHooks(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 9999n,
        advancedPoolHooks: hooks.address,
      },
    )
    expect(setHooksResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: pool.address,
      success: true,
    })

    return {
      pool,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
      hooks,
    }
  })

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
        forwardPayload: TokenPool_LockOrBurn.toCell(
          TokenPool_LockOrBurn.create({
            queryId: 44n,
            request: {
              ref: TokenPool_LockOrBurnInV1.create({
                transfer: TokenPool_Transfer.create({
                  id: 44n,
                  details: {
                    ref: TokenPool_TransferDetails.create({
                      receiver: { ref: receiverAddress },
                      remoteChainSelector,
                      originalSender: deployer.address,
                      amount: toNano('2'),
                      localToken: jettonMinter.address,
                    }),
                  },
                }),
              }),
            },
            requestedFinalityConfig: 0n,
            tokenArgs: null,
            replyTo: deployer.address,
          }),
        ),
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
    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.4'),
      {
        queryId: 46n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 46n,
              details: {
                ref: TokenPool_TransferDetails.create({
                  originalSender: { ref: sourcePoolAddress },
                  remoteChainSelector,
                  receiver: recipient.address,
                  amount: toNano('999999'),
                  localToken: jettonMinter.address,
                }),
              },
            }),
            sourcePoolAddress: { ref: sourcePoolAddress },
            sourcePoolData: null,
            offchainTokenData: null,
          }),
        },
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: lockReleasePool.address,
      success: false,
    })
    expect(await lockReleasePool.getHasPendingRelease(46n)).toBe(false)
  })

  it('refunds inbound rate-limit capacity when a release bounces (TON-TP/5)', async () => {
    // Pool wallet is empty (no prior lock), so the release passes admission (within the
    // rate limit) but the AskToTransfer bounces. The bounce handler must return the
    // capacity it consumed at admission, leaving the bucket as it started (full).
    const releaseAmount = toNano('5') // < inbound capacity (100), so admission succeeds
    const before = await lockReleasePool.getCurrentRateLimiterState(remoteChainSelector, false)
    expect(before.inbound.ref.tokens).toEqual(toNano('100'))

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.4'),
      {
        queryId: 77n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 77n,
              details: {
                ref: TokenPool_TransferDetails.create({
                  originalSender: { ref: sourcePoolAddress },
                  remoteChainSelector,
                  receiver: recipient.address,
                  amount: releaseAmount,
                  localToken: jettonMinter.address,
                }),
              },
            }),
            sourcePoolAddress: { ref: sourcePoolAddress },
            sourcePoolData: null,
            offchainTokenData: null,
          }),
        },
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    // The release transfer bounced back to the pool and was handled successfully.
    expect(result.transactions).toHaveTransaction({
      to: lockReleasePool.address,
      inMessageBounced: true,
      success: true,
    })
    expect(await lockReleasePool.getHasPendingRelease(77n)).toBe(false)

    // Consumed capacity (5) was refunded: the bucket is restored to its starting balance.
    const after = await lockReleasePool.getCurrentRateLimiterState(remoteChainSelector, false)
    expect(after.inbound.ref.tokens).toEqual(before.inbound.ref.tokens)
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
        forwardPayload: TokenPool_LockOrBurn.toCell(
          TokenPool_LockOrBurn.create({
            queryId: 11n,
            request: {
              ref: TokenPool_LockOrBurnInV1.create({
                transfer: TokenPool_Transfer.create({
                  id: 11n,
                  details: {
                    ref: TokenPool_TransferDetails.create({
                      receiver: { ref: receiverAddress },
                      remoteChainSelector,
                      originalSender: deployer.address,
                      amount: toNano('3'),
                      localToken: jettonMinter.address,
                    }),
                  },
                }),
              }),
            },
            requestedFinalityConfig: 0n,
            tokenArgs: null,
            replyTo: deployer.address,
          }),
        ),
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

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.4'),
      {
        queryId: 22n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 46n,
              details: {
                ref: TokenPool_TransferDetails.create({
                  originalSender: { ref: sourcePoolAddress },
                  remoteChainSelector,
                  receiver: recipient.address,
                  amount: toNano('2'),
                  localToken: jettonMinter.address,
                }),
              },
            }),
            sourcePoolAddress: { ref: sourcePoolAddress },
            sourcePoolData: null,
            offchainTokenData: null,
          }),
        },
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

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
      op: TokenPool_ReleaseOrMintFinished.PREFIX,
      body(body) {
        if (!body) return false
        const response = TokenPool_ReleaseOrMintFinished.fromSlice(body.beginParse())
        return response.queryId === 22n && response.out.ref.destinationAmount === toNano('2')
      },
    })
  })

  it('mirrors cursed state locally and blocks release while cursed', async () => {
    const curseUpdate = await lockReleasePool.sendTokenPoolSetCursedSubjects(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 901n,
        cursedSubjects: CursedSubjects.create({
          data: loadMap(
            Dictionary.Keys.BigInt(128),
            createEmptyTensorValue(),
            new Map([[remoteChainSelector, []]]),
          ),
        }),
      },
    )

    expect(curseUpdate.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    expect(await lockReleasePool.getVerifyNotCursed(remoteChainSelector)).toBe(false)

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.3'),
      {
        queryId: 33n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 33n,
              details: {
                ref: TokenPool_TransferDetails.create({
                  originalSender: { ref: sourcePoolAddress },
                  remoteChainSelector,
                  receiver: recipient.address,
                  amount: toNano('1'),
                  localToken: jettonMinter.address,
                }),
              },
            }),
            sourcePoolAddress: { ref: sourcePoolAddress },
            sourcePoolData: null,
            offchainTokenData: null,
          }),
        },
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: lockReleasePool.address,
      success: false,
    })
  })
})
