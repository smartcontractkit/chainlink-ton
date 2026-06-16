import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core'
import { asSnakedCell, asSnakedCellEmpty } from '../../../src/utils'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { CCTJettonMinter } from '../../../wrappers/ccip/CCTJettonMinter'
import { CCTJettonMinterCode, CCTJettonWalletCode } from '../../../wrappers/ccip/CCTJettonCode'
import { setupGenBindings } from '../../../wrappers/gen'
import {
  Ownable2Step,
  CrossChainAddress,
  CursedSubjects,
  RateLimiter_Config,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_RampUpdate,
  TokenPool_RateLimitConfigPair,
  TokenPool_ChainUpdate,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnFinished,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_MirroredPolicy,
  TokenPool_DynamicConfig,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { BurnMintTokenPool, JettonClient } from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { runTokenPoolBehaviorTests } from './TokenPool.behavior'

import * as rtOld from '../../../wrappers/ccip/Router'

function crossChainAddressFromBuffer(buffer: Buffer): CrossChainAddress {
  const addrSlice = rtOld.builder.data.crossChainAddress.encode(buffer).asSlice()
  return CrossChainAddress.fromSlice(addrSlice)
}

describe('BurnMintTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let cctMinter: SandboxContract<CCTJettonMinter>
  let cctMinterRuntime: SandboxContract<JettonMinter>
  let burnMintPool: SandboxContract<BurnMintTokenPool>
  let pool: SandboxContract<TokenPool>
  let cctWalletCode: Cell

  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  const remoteChainSelector = 91000001n

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
    unauthorized = await blockchain.treasury('unauthorized')
    recipient = await blockchain.treasury('recipient')

    cctWalletCode = await CCTJettonWalletCode()
    const cctMinterCode = await CCTJettonMinterCode()

    cctMinter = blockchain.openContract(
      CCTJettonMinter.createFromConfig(
        {
          totalSupply: 0n,
          adminAddress: deployer.address,
          nextAdminAddress: null,
          jettonWalletCode: cctWalletCode,
          metadataUri: 'cct-test',
        },
        cctMinterCode,
      ),
    )
    await cctMinter.sendDeploy(deployer.getSender(), toNano('1'))
    cctMinterRuntime = blockchain.openContract(JettonMinter.createFromAddress(cctMinter.address))

    burnMintPool = blockchain.openContract(
      BurnMintTokenPool.fromStorage({
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
                allowedFinalityConfig: 0n,
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
            token: cctMinter.address,
            tokenDecimals: 9n,
            remoteChainConfigs: Dictionary.empty(Dictionary.Keys.BigInt(64)),
            tokenTransferFeeConfigs: Dictionary.empty(Dictionary.Keys.BigInt(64)),
          }),
        },
        jettonClient: {
          ref: JettonClient.create({
            masterAddress: cctMinter.address,
            jettonWalletCode: cctWalletCode,
          }),
        },
        pendingMints: Dictionary.empty(Dictionary.Keys.BigInt(64)),
        pendingBurns: Dictionary.empty(Dictionary.Keys.BigInt(64)),
      }),
    )
    await burnMintPool.sendDeploy(deployer.getSender(), toNano('2'))

    // Standard TokenPool interface
    pool = blockchain.openContract(TokenPool.fromAddress(burnMintPool.address))

    {
      const r = await burnMintPool.sendTokenPoolApplyChainUpdates(
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

      expect(r.transactions).toHaveTransaction({
        from: deployer.address,
        to: burnMintPool.address,
        success: true,
      })
    }

    await burnMintPool.sendTokenPoolUpdateRampAccess(deployer.getSender(), toNano('0.2'), {
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
    })

    // Mint user-side test balance before handing minter admin to the pool.
    const mintToOnRamp = await cctMinterRuntime.sendMint(deployer.getSender(), {
      value: toNano('1'),
      mintOpcode: 0x00000015,
      message: {
        queryId: 101n,
        destination: deployer.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    expect(mintToOnRamp.transactions).toHaveTransaction({
      from: deployer.address,
      to: cctMinter.address,
      success: true,
    })

    await cctMinterRuntime.sendMint(deployer.getSender(), {
      value: toNano('1'),
      mintOpcode: 0x00000015,
      message: {
        queryId: 102n,
        destination: unauthorized.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('2'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    // Admin handoff: deployer sets pending admin to pool, pool claims ownership itself.
    const changeAdminResult = await cctMinterRuntime.sendChangeAdmin(deployer.getSender(), {
      value: toNano('0.2'),
      message: {
        queryId: 201n,
        newAdmin: burnMintPool.address,
      },
    })
    expect(changeAdminResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: cctMinter.address,
      success: true,
    })

    const claimAdminResult = await burnMintPool.sendBurnMintTokenPoolClaimMinterAdmin(
      deployer.getSender(),
      toNano('0.2'),
      { queryId: 202n },
    )
    expect(claimAdminResult.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    const jettonData = await cctMinterRuntime.getJettonData()
    expect(jettonData.admin).toEqualAddress(burnMintPool.address)
    expect(await cctMinterRuntime.getNextAdminAddress()).toBeNull()

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await cctMinterRuntime.getWalletAddress(address)),
      )
    }
  })

  runTokenPoolBehaviorTests('BurnMintTokenPool', async () => ({
    pool,
    deployer,
    offRamp,
    altOffRamp: deployer,
    unauthorized,
    recipient,
    remoteChainSelector,
    unsupportedChainSelector: remoteChainSelector + 1n,
    unknownSourcePoolAddress: crossChainAddressFromBuffer(Buffer.from('unknown-source-pool')),
    remoteTokenAddress: destTokenAddress,
    onRampAddress: deployer.address,
    destTokenAddress,
    sourcePoolAddress,
    localToken: cctMinter.address,
  }))

  it('has no pending burn or mint by default', async () => {
    expect(await burnMintPool.getHasPendingBurn(300n)).toBe(false)
    expect(await burnMintPool.getHasPendingMint(301n)).toBe(false)
  })

  it('rejects claim-minter-admin from non-owner sender', async () => {
    const result = await burnMintPool.sendBurnMintTokenPoolClaimMinterAdmin(
      unauthorized.getSender(),
      toNano('0.2'),
      { queryId: 302n },
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: burnMintPool.address,
      success: false,
    })
  })

  it('reverts lockOrBurn when caller is not configured on-ramp', async () => {
    const unauthorizedWallet = await userWallet(unauthorized.address)
    const poolWallet = await userWallet(burnMintPool.address)
    const result = await unauthorizedWallet.sendTransfer(unauthorized.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 303,
        jettonAmount: toNano('1'),
        destination: burnMintPool.address,
        responseDestination: unauthorized.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: TokenPool_LockOrBurn.toCell(
          TokenPool_LockOrBurn.create({
            queryId: 303n,
            request: {
              ref: TokenPool_LockOrBurnInV1.create({
                receiver: { ref: receiverAddress },
                remoteChainSelector,
                originalSender: unauthorized.address,
                amount: toNano('1'),
                localToken: cctMinter.address,
              }),
            },
            requestedFinalityConfig: 0n,
            tokenArgs: null,
            replyTo: unauthorized.address,
          }),
        ),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: burnMintPool.address,
      success: false,
    })
  })

  it('reverts lockOrBurn when payload amount does not match transferred amount', async () => {
    const onRampWallet = await userWallet(deployer.address)
    const poolWallet = await userWallet(burnMintPool.address)
    const result = await onRampWallet.sendTransfer(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 304,
        jettonAmount: toNano('2'),
        destination: burnMintPool.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: TokenPool_LockOrBurn.toCell(
          TokenPool_LockOrBurn.create({
            queryId: 304n,
            request: {
              ref: TokenPool_LockOrBurnInV1.create({
                receiver: { ref: receiverAddress },
                remoteChainSelector,
                originalSender: deployer.address,
                amount: toNano('1'),
                localToken: cctMinter.address,
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
      to: burnMintPool.address,
      success: false,
    })
  })

  it('burns tokens on lockOrBurn path and clears pending burn on confirmation', async () => {
    const onRampWallet = await userWallet(deployer.address)
    const poolWallet = await userWallet(burnMintPool.address)

    const result = await onRampWallet.sendTransfer(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 11,
        jettonAmount: toNano('3'),
        destination: burnMintPool.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.2'),
        forwardPayload: TokenPool_LockOrBurn.toCell(
          // TODO: fixme, this now requires elaborate context - TokenPool_LockOrBurnForwardPayload
          TokenPool_LockOrBurn.create({
            queryId: 11n,
            request: {
              ref: TokenPool_LockOrBurnInV1.create({
                receiver: { ref: receiverAddress },
                remoteChainSelector,
                originalSender: deployer.address,
                amount: toNano('3'),
                localToken: cctMinter.address,
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
      from: deployer.address,
      to: onRampWallet.address,
      success: true,
    })

    expect(await burnMintPool.getHasPendingBurn(11n)).toBe(false)
    expect(await poolWallet.getJettonBalance()).toEqual(0n)

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: deployer.address,
      success: true,
      op: TokenPool_LockOrBurnFinished.PREFIX,
    })
  })

  it('mints tokens on releaseOrMint path and clears pending mint on confirmation', async () => {
    const result = await burnMintPool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.6'),
      {
        queryId: 22n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            originalSender: { ref: sourcePoolAddress },
            remoteChainSelector,
            receiver: recipient.address,
            sourceDenominatedAmount: toNano('2'),
            localToken: cctMinter.address,
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
      to: burnMintPool.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    expect(await burnMintPool.getHasPendingMint(22n)).toBe(false)

    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
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

  it('mints on releaseOrMint with null replyTo without emitting response message', async () => {
    const result = await burnMintPool.sendTokenPoolReleaseOrMint(
      offRamp.getSender(),
      toNano('0.6'),
      {
        queryId: 305n,
        request: {
          ref: TokenPool_ReleaseOrMintInV1.create({
            originalSender: { ref: sourcePoolAddress },
            remoteChainSelector,
            receiver: recipient.address,
            sourceDenominatedAmount: toNano('1'),
            localToken: cctMinter.address,
            sourcePoolAddress: { ref: sourcePoolAddress },
            sourcePoolData: null,
            offchainTokenData: null,
          }),
        },
        requestedFinalityConfig: 0n,
        replyTo: null,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: burnMintPool.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: burnMintPool.address,
      to: cctMinter.address,
      success: true,
    })

    const releaseResponses = result.transactions.filter((tx: any) => {
      return (
        tx.inMessage?.info?.src?.equals?.(burnMintPool.address) &&
        tx.inMessage?.body?.beginParse?.().preloadUint?.(32) ===
          TokenPool_ReleaseOrMintFinished.PREFIX
      )
    })
    expect(releaseResponses.length).toBe(0)
    expect(await burnMintPool.getHasPendingMint(305n)).toBe(false)
  })
})
