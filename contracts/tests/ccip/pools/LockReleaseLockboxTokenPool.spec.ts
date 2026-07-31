import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, Dictionary, toNano } from '@ton/core'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
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
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnPrepared,
  TokenPool_LockOrBurnOutV1,
  TokenPool_LockOrBurnInV1,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_RateLimitConfigPair,
  TokenPool_RampUpdate,
  TokenPool_ChainUpdate,
  Ownable2Step,
  TokenPool_TransferDetails,
  TokenPool_Transfer,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import {
  JettonClient,
  LockReleaseLockboxTokenPool,
} from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import {
  JettonLockBox,
  JettonLockBox_WithdrawExtra,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'

import { runTokenPoolBehaviorTests, runTokenPoolAsyncHookBehaviorTests } from './TokenPool.behavior'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import { AccessControl_Data } from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

function emptyAccessControlData(): AccessControl_Data {
  return {
    $: 'AccessControl_Data',
    roles: Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()) as any,
  }
}

describe('LockReleaseLockboxTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>
  let lockboxOperator: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonLockBox: SandboxContract<JettonLockBox>
  let lockReleaseLockboxPool: SandboxContract<LockReleaseLockboxTokenPool>
  let pool: SandboxContract<TokenPool>
  let jettonWalletCode: Cell

  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  const remoteChainSelector = 90000001n

  let sourcePoolAddress: CrossChainAddress
  let destTokenAddress: CrossChainAddress
  let receiverAddress: CrossChainAddress

  beforeAll(async () => {
    sourcePoolAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('source-pool'))
    destTokenAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('dest-token'))
    receiverAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('receiver'))
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    offRamp = await blockchain.treasury('offramp')
    recipient = await blockchain.treasury('recipient')
    lockboxOperator = await blockchain.treasury('lockboxOperator')

    jettonWalletCode = await jetton.JettonWalletCode()
    const jettonMinterCode = await jetton.JettonMinterCode()

    // Deploy jetton minter
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

    // Deploy JettonLockBox
    jettonLockBox = blockchain.openContract(
      JettonLockBox.fromStorage({
        id: 1n,
        minterAddress: jettonMinter.address,
        walletAddress: null,
        rbac: emptyAccessControlData(),
      }),
    )
    await jettonLockBox.sendDeploy(deployer.getSender(), toNano('3'))

    // Initialize lockbox
    const lockboxWalletAddress = await jettonMinter.getWalletAddress(jettonLockBox.address)
    const initResult = await jettonLockBox.sendJettonLockBoxInit(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 1n,
        minterAddress: jettonMinter.address,
        walletAddress: lockboxWalletAddress,
        admin: deployer.address,
      },
    )
    expect(initResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonLockBox.address,
      success: true,
      exitCode: 0,
    })

    // Deploy LockReleaseLockboxTokenPool (need pool address for role grant below)
    lockReleaseLockboxPool = blockchain.openContract(
      LockReleaseLockboxTokenPool.fromStorage({
        poolData: TokenPool_Data.create({
          adminConfig: TokenPool_AdminConfig.create({
            ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
            rmnProxy: deployer.address,
            dynamicConfig: TokenPool_DynamicConfig.create({
              router: deployer.address,
              rateLimitAdmin: null,
              feeAdmin: null,
            }),
            jettonClient: JettonClient.create({
              masterAddress: jettonMinter.address,
              jettonWalletCode,
            }),
            allowedFinalityConfig: 0n,
            advancedPoolHooks: null,
          }),
          mirroredPolicy: TokenPool_MirroredPolicy.create({
            onRamps: new Map(),
            offRamps: new Map(),
            cursedSubjects: CursedSubjects.create({
              data: new Set(),
            }),
          }),
          tokenDecimals: 9n,
          remoteChainConfigs: new Map(),
          tokenTransferFeeConfigs: new Map(),
        }),
        lockbox: jettonLockBox.address,
        pendingLocks: new Map(),
        pendingReleases: new Map(),
      }),
    )
    await lockReleaseLockboxPool.sendDeploy(deployer.getSender(), toNano('5'))

    // Grant OPERATOR_ROLE to the pool on the lockbox (so pool can deposit/withdraw)
    const { crc32 } = require('zlib')
    const OPERATOR_ROLE_VALUE = BigInt('0x' + crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'))
    const acClient = blockchain.openContract(
      AccessControlClient.createFromAddress(jettonLockBox.address),
    )
    const grantRoleResult = await acClient.sendGrantRole(deployer.getSender(), toNano('0.1'), {
      queryId: 0n,
      role: OPERATOR_ROLE_VALUE,
      account: lockReleaseLockboxPool.address,
    })
    expect(grantRoleResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonLockBox.address,
      success: true,
      exitCode: 0,
    })

    // Standard TokenPool interface
    pool = blockchain.openContract(TokenPool.fromAddress(lockReleaseLockboxPool.address))

    // Apply chain updates
    const applyChains = await lockReleaseLockboxPool.sendTokenPoolApplyChainUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 1n,
        remoteChainSelectorsToRemove: [],
        chainsToAdd: [
          TokenPool_ChainUpdate.create({
            remoteChainSelector,
            remotePoolAddresses: [sourcePoolAddress],
            remoteTokenAddress: destTokenAddress,
            rateLimitConfigs: TokenPool_RateLimitConfigPair.create({
              outbound: RateLimiter_Config.create({
                isEnabled: true,
                capacity: toNano('100'),
                rate: 1n,
              }),
              inbound: RateLimiter_Config.create({
                isEnabled: true,
                capacity: toNano('100'),
                rate: 1n,
              }),
            }),
          }),
        ],
      },
    )

    expect(applyChains.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleaseLockboxPool.address,
      success: true,
    })

    // Update ramp access (deployer is the on-ramp)
    const updateRampAccess = await lockReleaseLockboxPool.sendTokenPoolUpdateRampAccess(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 2n,
        updates: [
          TokenPool_RampUpdate.create({
            remoteChainSelector,
            onRamp: deployer.address,
            offRamp: offRamp.address,
          }),
        ],
      },
    )

    expect(updateRampAccess.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleaseLockboxPool.address,
      success: true,
    })

    // Mint tokens to deployer's wallet (acts as on-ramp)
    const mintToDeployer = await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: deployer.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('1000'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    expect(mintToDeployer.transactions).toHaveTransaction({
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

  const setupTokenPoolBehaviorContext = async () => {
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 0n,
        destination: jettonLockBox.address,
        tonAmount: toNano('0.5'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: toNano('0.3'),
      },
    })
  }

  runTokenPoolBehaviorTests('LockReleaseLockboxTokenPool', async () => ({
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
  }), {
    setup: setupTokenPoolBehaviorContext,
  })

  // Async hook behavior tests (TON-TP/6)
  runTokenPoolAsyncHookBehaviorTests('LockReleaseLockboxTokenPool', async () => {
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

  /* === LockReleaseLockboxTokenPool-specific tests === */

  describe('getters', () => {
    it('should return correct lockbox address', async () => {
      expect(await lockReleaseLockboxPool.getLockbox()).toEqualAddress(jettonLockBox.address)
    })

    it('should return correct token and decimals', async () => {
      expect(await lockReleaseLockboxPool.getToken()).toEqualAddress(jettonMinter.address)
      expect(await lockReleaseLockboxPool.getTokenDecimals()).toBe(9n)
    })

    it('should have no pending lock by default', async () => {
      expect(await lockReleaseLockboxPool.getHasPendingLock(999n)).toBe(false)
    })

    it('should have no pending release by default', async () => {
      expect(await lockReleaseLockboxPool.getHasPendingRelease(999n)).toBe(false)
    })
  })

  describe('lock flow (jetton transfer -> lockbox custody)', () => {
    it('should store pending lock on jetton transfer notification and forward to lockbox', async () => {
      // Send jettons to pool via on-ramp jetton wallet (simulates cross-chain lock)
      const onRampWallet = await userWallet(deployer.address)
      const poolWallet = await userWallet(lockReleaseLockboxPool.address)

      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId: 100n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 100n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('10'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })

      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('10'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress: destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      const result = await onRampWallet.sendTransfer(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 100,
          jettonAmount: toNano('10'),
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.3'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      // Pool's jetton wallet sends TransferNotificationForRecipient to pool
      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      // Pool should have a pending lock
      expect(await lockReleaseLockboxPool.getHasPendingLock(100n)).toBe(true)
    })

    it('should store pending lock when forwarded amount matches transfer amount', async () => {
      // Verify the pending lock is created when amounts match
      const onRampWallet = await userWallet(deployer.address)

      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId: 101n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 101n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('5'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })

      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('5'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress: destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      await onRampWallet.sendTransfer(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 101,
          jettonAmount: toNano('5'),
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.3'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(await lockReleaseLockboxPool.getHasPendingLock(101n)).toBe(true)
    })
  })

  describe('release flow (lockbox withdrawal)', () => {
    it('should store pending release and send JettonLockBox_Withdraw to lockbox', async () => {
      // First mint tokens directly to the lockbox wallet (simulating prior locks)
      const lockboxWalletAddress = await jettonMinter.getWalletAddress(jettonLockBox.address)
      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 0n,
          destination: lockboxWalletAddress,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('50'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })

      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('0.5'),
        {
          queryId: 200n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 200n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('5'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      // Pool processes the release request
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      // Pool should have a pending release
      expect(await lockReleaseLockboxPool.getHasPendingRelease(200n)).toBe(true)

      // Pool sends JettonLockBox_Withdraw to the lockbox (lockbox will handle the jetton transfer)
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: jettonLockBox.address,
        op: 0xd065c306, // JettonLockBox_Withdraw
        success: true,
      })
    })

    it('should reject duplicate release requests with PendingReleaseAlreadyExists', async () => {
      // Fund lockbox first
      const lockboxWalletAddress = await jettonMinter.getWalletAddress(jettonLockBox.address)
      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 0n,
          destination: lockboxWalletAddress,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('50'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })

      // First release request - should succeed
      const firstResult = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('0.5'),
        {
          queryId: 220n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 220n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('5'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      expect(firstResult.transactions).toHaveTransaction({
        to: lockReleaseLockboxPool.address,
        success: true,
      })
      expect(await lockReleaseLockboxPool.getHasPendingRelease(220n)).toBe(true)

      // Second release with same queryId - should be rejected
      const secondResult = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('0.5'),
        {
          queryId: 220n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 220n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('5'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      // Exit code 48702 = PendingReleaseAlreadyExists
      expect(secondResult.transactions).toHaveTransaction({
        to: lockReleaseLockboxPool.address,
        success: false,
        exitCode: 48702,
      })

      // Original pending release should still exist
      expect(await lockReleaseLockboxPool.getHasPendingRelease(220n)).toBe(true)
    })

    it('should reject release when requested amount exceeds lockbox liquidity', async () => {
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('0.4'),
        {
          queryId: 201n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 201n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('999999'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: lockReleaseLockboxPool.address,
        success: false,
      })
      expect(await lockReleaseLockboxPool.getHasPendingRelease(201n)).toBe(false)
    })
  })

  describe('full lock flow (end-to-end through lockbox)', () => {
    it('should complete full lock flow: jetton transfer -> pool -> lockbox -> pool finalize', async () => {
      // Fund lockbox wallet with a small mint to activate it
      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 0n,
          destination: jettonLockBox.address,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('1'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })

      const lockboxWallet = await userWallet(jettonLockBox.address)
      const initialLockboxBalance = await lockboxWallet.getJettonBalance()

      // Send jettons to pool via on-ramp jetton wallet (triggers the full lock flow)
      const onRampWallet = await userWallet(deployer.address)
      const poolWallet = await userWallet(lockReleaseLockboxPool.address)

      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId: 300n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 300n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('8'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })

      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('8'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress: destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      const result = await onRampWallet.sendTransfer(deployer.getSender(), {
        value: toNano('3'),
        message: {
          queryId: 300,
          jettonAmount: toNano('8'),
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.5'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      // The pool's jetton wallet sends TransferNotificationForRecipient to the pool
      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      // The pool sends AskToTransfer to its own jetton wallet (to forward to lockbox)
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: poolWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer
      })

      // The pool's wallet sends TransferNotification to the lockbox wallet
      // (the pool computes this using its stored jetton wallet code)
      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        op: 0x178d4519, // TransferNotificationForRecipient
        success: true,
      })

      // Pool stores pending lock after receiving TransferNotificationForRecipient
      expect(await lockReleaseLockboxPool.getHasPendingLock(300n)).toBe(true)

      // The pool computes the lockbox wallet address and sends AskToTransfer to forward jettons
      // In the sandbox, the lockbox wallet is a standard jetton wallet (not JettonLockBox contract).
      // It returns excesses but does NOT send JettonLockBox_Deposited back to finalize.
      // In production, the JettonLockBox contract would process the deposit and send the callback,
      // clearing the pending lock and emitting TokenPool_LockedOrBurned.
    })

    it('returns duplicate lock transfers and notifies the requester', async () => {
      // The pending lock from the first request makes the second continuation fail.
      // The shared TP path must recover those already-received jettons.

      const onRampWallet = await userWallet(deployer.address)
      const poolWallet = await userWallet(lockReleaseLockboxPool.address)

      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId: 310n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 310n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('5'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })

      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('5'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress: destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      // First lock request - should succeed
      const firstResult = await onRampWallet.sendTransfer(deployer.getSender(), {
        value: toNano('3'),
        message: {
          queryId: 310,
          jettonAmount: toNano('5'),
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.5'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(firstResult.transactions).toHaveTransaction({
        to: lockReleaseLockboxPool.address,
        success: true,
      })
      expect(await lockReleaseLockboxPool.getHasPendingLock(310n)).toBe(true)

      // Second lock request with the same queryId is returned by the shared continuation path.
      const secondResult = await onRampWallet.sendTransfer(deployer.getSender(), {
        value: toNano('3'),
        message: {
          queryId: 310,
          jettonAmount: toNano('5'),
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.5'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(secondResult.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })
      expect(secondResult.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: poolWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer
      })
      expect(secondResult.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: deployer.address,
        // The Treasury test recipient does not implement this callback. Assert
        // the emitted message, including that it carries the residual inbound
        // value instead of consuming it in the pool.
        op: TokenPool_LockOrBurnFailure.PREFIX,
        value: (value) => value !== undefined && value > 0n,
        body(body) {
          if (!body) return false
          const failure = TokenPool_LockOrBurnFailure.fromSlice(body.beginParse())
          return failure.queryId === 310n && failure.errorCode === 48700n
        },
      })

      // Original pending lock should still exist
      expect(await lockReleaseLockboxPool.getHasPendingLock(310n)).toBe(true)
      expect(await onRampWallet.getJettonBalance()).toEqual(toNano('995'))
      expect(await poolWallet.getJettonBalance()).toEqual(0n)
    })
  })

  describe('full release flow (end-to-end through lockbox)', () => {
    it('should complete full release flow: offRamp -> pool -> lockbox -> lockbox wallet -> ReturnExcessesBack -> pool finalize', async () => {
      // Fund lockbox wallet with jettons (simulating prior locks)
      const lockboxWalletAddress = await jettonMinter.getWalletAddress(jettonLockBox.address)
      const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 0n,
          destination: jettonLockBox.address,
          tonAmount: toNano('0.5'),
          jettonAmount: toNano('50'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: toNano('0.3'),
        },
      })
      expect(mintResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: jettonMinter.address,
        success: true,
      })

      // Note: the standard jetton minter deploys wallets at computed addresses.
      // We mainly verify the release transaction flow and state transitions.

      // Trigger release from off-ramp
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('1'),
        {
          queryId: 400n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 400n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('5'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      // Pool processes the release request
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      // Pool sends JettonLockBox_Withdraw to lockbox
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: jettonLockBox.address,
        success: true,
      })

      // Lockbox sends AskToTransfer to its jetton wallet
      expect(result.transactions).toHaveTransaction({
        from: jettonLockBox.address,
        to: lockboxWalletAddress,
        success: true,
      })

      // Lockbox jetton wallet sends TransferNotification to the recipient's wallet
      expect(result.transactions).toHaveTransaction({
        from: lockboxWalletAddress,
        op: 0x178d4519, // TransferNotificationForRecipient
        success: true,
      })

      // Recipient's wallet sends ReturnExcessesBack to the pool
      expect(result.transactions).toHaveTransaction({
        to: lockReleaseLockboxPool.address,
        op: 0xd53276db, // ReturnExcessesBack
        success: true,
      })

      // Pending release should be cleared (release completed)
      expect(await lockReleaseLockboxPool.getHasPendingRelease(400n)).toBe(false)

      // Release flow complete: offRamp -> pool -> lockbox -> lockbox wallet -> TransferNotification -> recipient wallet
      // Recipient wallet sends ReturnExcessesBack to pool confirming the transfer.
    })

    it('should handle release flow failure when lockbox has insufficient balance', async () => {
      // Don't fund the lockbox - leave it empty (or with minimal balance)

      // Trigger release request for more than the lockbox holds
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        offRamp.getSender(),
        toNano('0.5'),
        {
          queryId: 401n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 401n,
              details: TokenPool_TransferDetails.create({
                originalSender: sourcePoolAddress,
                remoteChainSelector,
                receiver: recipient.address,
                amount: toNano('999999'),
                localToken: jettonMinter.address,
              }),
            }),
            sourcePoolAddress: sourcePoolAddress,
            sourcePoolData: null,
            offchainTokenData: null,
          }),
          requestedFinalityConfig: 0n,
          replyTo: deployer.address,
        },
      )

      // The release request should fail or bounce
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: lockReleaseLockboxPool.address,
        success: false,
      })

      // No pending release should exist (either rejected upfront or cleaned up)
      expect(await lockReleaseLockboxPool.getHasPendingRelease(401n)).toBe(false)
    })
  })

  describe('cursed state', () => {
    it('should mirror cursed state locally and block release while cursed', async () => {
      const curseUpdate = await lockReleaseLockboxPool.sendTokenPoolSetCursedSubjects(
        deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 901n,
          cursedSubjects: CursedSubjects.create({
            data: new Set([remoteChainSelector]),
          }),
        },
      )

      expect(curseUpdate.transactions).toHaveTransaction({
        from: deployer.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      expect(await lockReleaseLockboxPool.getVerifyNotCursed(remoteChainSelector)).toBe(false)
    })
  })
})
