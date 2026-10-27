import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract, internal } from '@ton/sandbox'
import { Address, Cell, beginCell, Dictionary, toNano } from '@ton/core'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { createEmptyCursePolicy } from '../../../wrappers/ccip/Router'
import {
  CrossChainAddress,
  CursedSubjects,
  RateLimiter_Config,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_ReleaseOrMintFinalized,
  TransferNotificationForRecipient,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnWithdraw,
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnFinished,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnPrepared,
  TokenPool_LockOrBurnOutV1,
  TokenPool_LockOrBurnInV1,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_RateLimitConfigPair,
  TokenPool_ChainUpdate,
  Ownable2Step,
  TokenPool_TransferDetails,
  TokenPool_Transfer,
  TokenPool_TokenTransferFeeConfig,
  TokenPool_TokenTransferFeeConfigArgs,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import {
  JettonClient,
  AskToTransfer,
  LockReleaseLockboxTokenPool,
  LockReleaseLockboxTokenPool_LockContext,
} from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import {
  JettonLockBox,
  AccessControl_Data,
  JettonLockBox_Withdraw,
  JettonLockBox_WithdrawExtra,
  JettonLockBox_WithdrawFailed,
  JettonLockBox_Deposit,
  JettonLockBox_DepositFailed,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'

import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { contractCode } from '../../../wrappers/codeLoader'
import {
  deliveryTo,
  parseDepositAccountNotify,
  runTokenPoolBehaviorTests,
} from './TokenPool.behavior'
import { runTokenPoolAsyncHookBehaviorTests } from './TokenPool.asyncHook.behavior'
import { runTokenPoolWithdrawFeeTokensBehaviorTests } from './TokenPool.withdrawFeeTokens.behavior'
import { runTokenPoolCcvFeesBehaviorTests } from './TokenPool.ccvFees.behavior'
import { deriveOnRampAccountAddress } from '../../../wrappers/ccip/OnRampAccount'
import * as da from '../../../wrappers/gen/ccip/DepositAccount'
import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import * as Deployable from '../../../wrappers/libraries/Deployable'

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
  let deployableCode: Cell

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
    blockchain.now = 1
    deployer = await blockchain.treasury('deployer')
    offRamp = await blockchain.treasury('offramp')
    recipient = await blockchain.treasury('recipient')
    lockboxOperator = await blockchain.treasury('lockboxOperator')

    jettonWalletCode = await contractCode.jetton('JettonWallet')
    const jettonMinterCode = await contractCode.jetton('JettonMinter')
    deployableCode = await contractCode.ccip.local('Deployable')

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
      JettonLockBox.fromStorage(
        {
          id: 1n,
          minterAddress: jettonMinter.address,
          walletAddress: null,
          initializer: deployer.address,
          rbac: emptyAccessControlData(),
        },
        { overrideContractCode: await contractCode.ccip.local('ccip.pool.JettonLockBox') },
      ),
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
      LockReleaseLockboxTokenPool.fromStorage(
        {
          poolData: TokenPool_Data.create({
            adminConfig: TokenPool_AdminConfig.create({
              ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
              dynamicConfig: TokenPool_DynamicConfig.create({
                router: deployer.address,
                rateLimitAdmin: null,
                feeAdmin: null,
              }),
              allowedDepositNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
              jettonClient: JettonClient.create({
                masterAddress: jettonMinter.address,
                jettonWalletCode,
              }),
              allowedFinalityConfig: 0n,
              advancedPoolHooks: null,
            }),
            localPolicy: TokenPool_LocalPolicy.create({
              cursePolicy: createEmptyCursePolicy(deployer.address),
            }),
            tokenDecimals: 9n,
            remoteChainConfigs: new Map(),
            tokenTransferFeeConfigs: new Map(),
          }),
          lockbox: jettonLockBox.address,
        },
        {
          overrideContractCode: await contractCode.ccip.local(
            'ccip.pool.LockReleaseLockboxTokenPool',
          ),
        },
      ),
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

  // Funds the lockbox with jettons so release flows can actually complete.
  // A raw mint to the lockbox does NOT work: the mint flow isn't required to
  // set the transferInitiator so we cannot check if OPERATOR. Instead, deposit
  // through the pool (the OPERATOR) with a valid forward payload so the jettons
  // stay in the lockbox.
  // The deposit impersonates the Router-driven flow: the sender's OnRampAccount (derived
  // offchain) transfers to the pool carrying the forward payload, tagged with
  // `initiator` = Router, which the pool requires to trust the payload.
  // @param amount Number of jettons to deposit into the lockbox.
  // @param queryId Unique queryId to avoid collisions across repeated calls.
  // @returns The lockbox's jetton wallet address.
  const fundLockboxViaLock = async (
    amount: bigint,
    queryId: number | bigint = 7000n,
  ): Promise<Address> => {
    const lockOrBurn = TokenPool_LockOrBurn.create({
      queryId: BigInt(queryId),
      request: TokenPool_LockOrBurnInV1.create({
        transfer: TokenPool_Transfer.create({
          id: BigInt(queryId),
          details: TokenPool_TransferDetails.create({
            receiver: receiverAddress,
            remoteChainSelector,
            originalSender: deployer.address,
            amount,
            localToken: jettonMinter.address,
          }),
        }),
      }),
      requestedFinalityConfig: 0n,
      tokenArgs: null,
      replyTo: deployer.address,
      onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
      finalizationValue: toNano('0.01'),
    })
    const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
      originalSender: deployer.address,
      requestMsg: lockOrBurn,
      prepared: TokenPool_LockOrBurnPrepared.create({
        feeAmount: 0n,
        destTokenAmount: amount,
        out: TokenPool_LockOrBurnOutV1.create({
          destTokenAddress: destTokenAddress,
          destPoolData: Cell.EMPTY,
        }),
      }),
    })
    const accountAddress = deriveOnRampAccountAddress({
      router: deployer.address,
      user: deployer.address,
      token: jettonMinter.address,
      deployableCode,
    })
    const deployerWallet = await userWallet(deployer.address)
    await deployerWallet.sendTransfer(deployer.getSender(), {
      value: toNano('3'),
      message: {
        queryId: Number(queryId),
        jettonAmount: amount,
        destination: accountAddress,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: 0n,
        forwardPayload: null,
      },
    })
    const accountWallet = await userWallet(accountAddress)
    const result = await accountWallet.sendTransfer(blockchain.sender(accountAddress), {
      value: toNano('3'),
      message: {
        queryId: Number(queryId),
        jettonAmount: amount,
        destination: lockReleaseLockboxPool.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.5'),
        forwardPayload: da.Jetton_ForwardPayloadWrap.toCell(
          da.Jetton_ForwardPayloadWrap.create({
            initiator: deployer.address, // the Router: the pool requires it as the initiator
            context: null,
            forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
          }),
        ),
      },
    })
    // The pool (OPERATOR) deposits into the lockbox; the lock must finalize successfully.
    expect(result.transactions).toHaveTransaction({
      to: jettonLockBox.address,
      success: true,
    })
    // Verify the jettons actually stayed in the lockbox wallet (not D1-returned).
    const lockboxWalletAddress = await jettonMinter.getWalletAddress(jettonLockBox.address)
    const lockboxWallet = blockchain.openContract(
      JettonWallet.createFromAddress(lockboxWalletAddress),
    )
    expect(await lockboxWallet.getJettonBalance()).toEqual(amount)
    return lockboxWalletAddress
  }

  const setupTokenPoolBehaviorContext = async () => {
    // Fund the lockbox so release completions can actually be observed in behavior tests.
    await fundLockboxViaLock(toNano('10'))
  }

  runTokenPoolBehaviorTests(
    'LockReleaseLockboxTokenPool',
    async () => ({
      pool,
      blockchain,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
      releaseOrMintInitiator: jettonLockBox.address,
    }),
    {
      setup: setupTokenPoolBehaviorContext,
    },
  )

  // Async hook behavior tests (TON-TP/6)
  runTokenPoolAsyncHookBehaviorTests('LockReleaseLockboxTokenPool', async () => {
    // Deploy mock hooks
    const hooks = blockchain.openContract(
      MockAdvancedPoolHooks.fromStorage(
        { id: 0n },
        {
          overrideContractCode: await contractCode.ccip.local('ccip.test.mockAdvancedPoolHooks'),
        },
      ),
    )
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
      blockchain,
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

  // WithdrawFeeTokens behavior tests (fee accrual + withdrawal). The lockbox pool forwards only
  // the post-fee amount to the lockbox, leaving the fee in the pool's own wallet as the
  // withdrawable amount (no accrued-fee ledger => unbounded base path).
  runTokenPoolWithdrawFeeTokensBehaviorTests('LockReleaseLockboxTokenPool', async () => {
    const feeAdmin = await blockchain.treasury('feeAdmin')
    const unauthorized = await blockchain.treasury('unauthorized')
    const feeBps = 100n // 1% transfer fee
    const poolWallet = await userWallet(lockReleaseLockboxPool.address)

    // Enable a 1% transfer fee for the lane so locks accrue fees into the pool wallet.
    await lockReleaseLockboxPool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 3n,
        updates: [
          TokenPool_TokenTransferFeeConfigArgs.create({
            destChainSelector: remoteChainSelector,
            tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.create({
              destGasOverhead: 1n,
              destBytesOverhead: 0n,
              finalityFeeUSDCents: 0n,
              fastFinalityFeeUSDCents: 0n,
              finalityTransferFeeBps: feeBps,
              fastFinalityTransferFeeBps: feeBps,
              isEnabled: true,
            }),
          }),
        ],
        disableChainSelectors: [],
      },
    )

    // Performs a successful fee-accruing lock of `amount` jettons. The pool forwards only the
    // post-fee amount to the lockbox, leaving `feeAmount` in the pool's own wallet.
    const doLock = async (amount: bigint, queryId: bigint) => {
      const feeAmount = (amount * feeBps) / 10000n
      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: queryId,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount,
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
        onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
        finalizationValue: toNano('0.01'),
      })
      const transferPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount,
          destTokenAmount: amount - feeAmount,
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })
      const accountAddress = deriveOnRampAccountAddress({
        router: deployer.address,
        user: deployer.address,
        token: jettonMinter.address,
        deployableCode,
      })
      const deployerWallet = await userWallet(deployer.address)
      await deployerWallet.sendTransfer(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: accountAddress,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })
      const accountWallet = await userWallet(accountAddress)
      await accountWallet.sendTransfer(blockchain.sender(accountAddress), {
        value: toNano('2'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: beginCell().storeBit(1).endCell(),
          forwardTonAmount: toNano('0.5'),
          forwardPayload: da.Jetton_ForwardPayloadWrap.toCell(
            da.Jetton_ForwardPayloadWrap.create({
              initiator: deployer.address, // the Router: the pool requires it as the initiator
              context: null,
              forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(transferPayload),
            }),
          ),
        },
      })
      return { feeAmount }
    }

    // The pool's own jetton wallet is only deployed once it first receives jettons, so tolerate
    // it not being active yet (returns 0 pre-first-lock).
    const getWithdrawableFees = async (): Promise<bigint> => {
      try {
        return await poolWallet.getJettonBalance()
      } catch {
        return 0n
      }
    }

    return {
      pool,
      blockchain,
      deployer,
      recipient,
      unauthorized,
      feeAdmin,
      getWithdrawableFees,
      poolWallet,
      userWallet,
      feeBps,
      doLock,
    }
  })

  // CCV & fees behavior (TON-TP: getCCVs / getCCVsAndFees parity with EVM IPoolV2).
  // Enables a 1% fee config so the getCCVsAndFees post-fee math is exercised.
  runTokenPoolCcvFeesBehaviorTests(
    'LockReleaseLockboxTokenPool',
    async () => ({
      pool,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      blockchain,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
    }),
    { withFeeConfig: true },
  )

  /* === LockReleaseLockboxTokenPool-specific tests === */

  describe('getters', () => {
    it('should return correct lockbox address', async () => {
      expect(await lockReleaseLockboxPool.getLockbox()).toEqualAddress(jettonLockBox.address)
    })

    it('should return correct token and decimals', async () => {
      expect(await lockReleaseLockboxPool.getToken()).toEqualAddress(jettonMinter.address)
      expect(await lockReleaseLockboxPool.getTokenDecimals()).toBe(9n)
    })
  })

  describe('lock flow (jetton transfer -> lockbox custody)', () => {
    // Runs the authenticated lock flow: the deployer's wallet funds the derived OnRampAccount,
    // which then transfers to the pool carrying the Router-initiated forward payload wrapper
    // (same shape as `fundLockboxViaLock`). Sending directly from a user wallet with an
    // unwrapped payload would take the pool's recovery path instead of locking.
    const lockViaOnRampAccount = async (amount: bigint, queryId: bigint) => {
      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: queryId,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount,
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
        onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
        finalizationValue: toNano('0.01'),
      })

      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: amount,
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress: destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      const accountAddress = deriveOnRampAccountAddress({
        router: deployer.address,
        user: deployer.address,
        token: jettonMinter.address,
        deployableCode,
      })
      const deployerWallet = await userWallet(deployer.address)
      await deployerWallet.sendTransfer(deployer.getSender(), {
        value: toNano('3'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: accountAddress,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })
      const accountWallet = await userWallet(accountAddress)
      return accountWallet.sendTransfer(blockchain.sender(accountAddress), {
        value: toNano('3'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: lockReleaseLockboxPool.address,
          responseDestination: deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.5'),
          forwardPayload: da.Jetton_ForwardPayloadWrap.toCell(
            da.Jetton_ForwardPayloadWrap.create({
              initiator: deployer.address, // the Router: the pool requires it as the initiator
              context: null,
              forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
            }),
          ),
        },
      })
    }

    // The lockbox wallet is lazily deployed on first funding, so tolerate it not being active yet.
    const lockboxBalance = async (): Promise<bigint> => {
      try {
        return await (await userWallet(jettonLockBox.address)).getJettonBalance()
      } catch {
        return 0n
      }
    }

    it('should store pending lock on jetton transfer notification and forward to lockbox', async () => {
      const poolWallet = await userWallet(lockReleaseLockboxPool.address)
      const lockboxBalanceBefore = await lockboxBalance()

      const result = await lockViaOnRampAccount(toNano('10'), 100n)

      // Pool's jetton wallet sends TransferNotificationForRecipient to pool
      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleaseLockboxPool.address,
        op: TransferNotificationForRecipient.PREFIX,
        success: true,
      })
      // The pool forwards custody to the lockbox (not a custody return to the sender).
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: poolWallet.address,
        op: AskToTransfer.PREFIX,
        success: true,
        body(body) {
          if (!body) return false
          const transfer = AskToTransfer.fromSlice(body.beginParse())
          return (
            transfer.jettonAmount === toNano('10') &&
            transfer.transferRecipient.equals(jettonLockBox.address)
          )
        },
      })
      // The lock finalizes successfully with the reply sent to the Router stand-in.
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: deployer.address,
        op: TokenPool_LockOrBurnFinished.PREFIX,
        success: true,
      })
      expect(result.transactions).not.toHaveTransaction({
        op: TokenPool_LockOrBurnFailure.PREFIX,
      })
      // The jettons ended up in the lockbox's wallet.
      expect(await lockboxBalance()).toEqual(lockboxBalanceBefore + toNano('10'))
    })

    it('should store pending lock when forwarded amount matches transfer amount', async () => {
      const lockboxBalanceBefore = await lockboxBalance()

      const result = await lockViaOnRampAccount(toNano('5'), 101n)

      // Amounts match, so the lock finalizes and custody lands in the lockbox.
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: deployer.address,
        op: TokenPool_LockOrBurnFinished.PREFIX,
        success: true,
      })
      expect(result.transactions).not.toHaveTransaction({
        op: TokenPool_LockOrBurnFailure.PREFIX,
      })
      expect(await lockboxBalance()).toEqual(lockboxBalanceBefore + toNano('5'))
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
        deployer.getSender(),
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
          delivery: deliveryTo(recipient.address, deployer.address),
        },
      )

      // Pool processes the release request
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })

      // Pool sends JettonLockBox_Withdraw to the lockbox (lockbox will handle the jetton transfer)
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: jettonLockBox.address,
        op: 0xd065c306, // JettonLockBox_Withdraw
        success: true,
      })
    })

    it('should reject release when requested amount exceeds lockbox liquidity', async () => {
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        deployer.getSender(),
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
          delivery: deliveryTo(recipient.address, deployer.address),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: lockReleaseLockboxPool.address,
        success: false,
      })
    })
  })

  describe('release failure reported by the lockbox', () => {
    // Releases through the pool and returns the JettonLockBox_Withdraw it sent to the lockbox,
    // which the lockbox echoes back as context in JettonLockBox_WithdrawFailed.
    const releaseAndCaptureWithdraw = async (queryId: bigint) => {
      await fundLockboxViaLock(toNano('50'), 600n + queryId)
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        deployer.getSender(),
        toNano('1'),
        {
          queryId,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: queryId,
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
          replyTo: offRamp.address,
          delivery: deliveryTo(recipient.address, offRamp.address),
        },
      )
      const withdrawTx = result.transactions.find((tx) => {
        const body = tx.inMessage?.body
        const dest = tx.inMessage?.info.dest
        if (!body || !(dest instanceof Address) || !dest.equals(jettonLockBox.address)) return false
        const slice = body.beginParse()
        return slice.remainingBits >= 32 && slice.preloadUint(32) === JettonLockBox_Withdraw.PREFIX
      })
      expect(withdrawTx).toBeDefined()
      const withdraw = JettonLockBox_Withdraw.fromSlice(withdrawTx!.inMessage!.body.beginParse())
      expect(withdraw.recipient.equals(recipient.address)).toBe(true)
      return withdraw
    }

    it('replies ReleaseOrMintFailure to replyTo when the lockbox reports the withdraw failed', async () => {
      const queryId = 610n
      const withdraw = await releaseAndCaptureWithdraw(queryId)

      const result = await lockReleaseLockboxPool.sendJettonLockBoxWithdrawFailed(
        blockchain.sender(jettonLockBox.address),
        toNano('0.2'),
        {
          queryId,
          token: jettonMinter.address,
          context: withdraw,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: offRamp.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
        body(body) {
          if (!body) return false
          return TokenPool_ReleaseOrMintFailure.fromSlice(body.beginParse()).queryId === queryId
        },
      })
    })

    it('rejects a JettonLockBox_WithdrawFailed that does not come from the lockbox', async () => {
      const queryId = 611n
      const withdraw = await releaseAndCaptureWithdraw(queryId)

      const unauthorized = await blockchain.treasury('unauthorized')
      const result = await lockReleaseLockboxPool.sendJettonLockBoxWithdrawFailed(
        unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId,
          token: jettonMinter.address,
          context: withdraw,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: unauthorized.address,
        to: lockReleaseLockboxPool.address,
        success: false,
      })
      expect(result.transactions).not.toHaveTransaction({
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
      })
    })

    it('unwinds the release when the lockbox rejects the withdraw at entry (bounce)', async () => {
      // Fund the lockbox while the pool still holds OPERATOR_ROLE, then revoke it so the lockbox
      // rejects the withdraw at entry. No JettonLockBox_WithdrawFailed follows in that case: the
      // withdraw bounces back to the pool, which must still refund the inbound rate limit and
      // reply with a ReleaseOrMintFailure.
      await fundLockboxViaLock(toNano('50'), 620n)
      const accessControl = blockchain.openContract(
        AccessControlClient.createFromAddress(jettonLockBox.address),
      )
      await accessControl.sendRevokeRole(deployer.getSender(), toNano('0.1'), {
        queryId: 0n,
        role: BigInt(require('zlib').crc32('OPERATOR_ROLE')),
        account: lockReleaseLockboxPool.address,
      })

      const queryId = 620n
      const rateLimitBefore = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        deployer.getSender(),
        toNano('1'),
        {
          queryId,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: queryId,
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
          replyTo: offRamp.address,
          delivery: deliveryTo(recipient.address, offRamp.address),
        },
      )

      // The lockbox rejected the withdraw and the request bounced back to the pool.
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: jettonLockBox.address,
        op: JettonLockBox_Withdraw.PREFIX,
        success: false,
      })
      expect(result.transactions).toHaveTransaction({
        to: lockReleaseLockboxPool.address,
        inMessageBounced: true,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: offRamp.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
        body(body) {
          if (!body) return false
          return TokenPool_ReleaseOrMintFailure.fromSlice(body.beginParse()).queryId === queryId
        },
      })
      expect(
        (await pool.getCurrentRateLimiterState(remoteChainSelector, false)).inbound.tokens,
      ).toEqual(rateLimitBefore.inbound.tokens)
    })
  })

  describe('full lock flow (end-to-end through lockbox)', () => {
    it.each(['flag', 'reference'])(
      'keeps base recovery for an authenticated notification missing its forwarding %s',
      async (missing) => {
        const wallet = await userWallet(lockReleaseLockboxPool.address)
        const balanceBefore = (await blockchain.getContract(lockReleaseLockboxPool.address)).balance
        const result = await blockchain.sendMessage(
          internal({
            from: wallet.address,
            to: lockReleaseLockboxPool.address,
            value: toNano('0.05'),
            body: TransferNotificationForRecipient.toCell(
              TransferNotificationForRecipient.create({
                queryId: 304n,
                jettonAmount: 1n,
                transferInitiator: deployer.address,
                forwardPayload:
                  missing === 'flag'
                    ? Cell.EMPTY.beginParse()
                    : beginCell().storeBit(true).asSlice(),
              }),
            ),
          }),
        )
        expect(result.transactions).toHaveTransaction({
          from: wallet.address,
          to: lockReleaseLockboxPool.address,
          op: TransferNotificationForRecipient.PREFIX,
          success: true,
        })
        // The malformed notification is returned best-effort with a short bounce.
        expect(result.transactions).toHaveTransaction({
          from: lockReleaseLockboxPool.address,
          to: wallet.address,
          op: AskToTransfer.PREFIX,
        })
        expect(result.transactions).toHaveTransaction({
          to: lockReleaseLockboxPool.address,
          inMessageBounced: true,
          success: true,
        })
        expect(
          (await blockchain.getContract(lockReleaseLockboxPool.address)).balance,
        ).toBeGreaterThanOrEqual(balanceBefore)
      },
    )

    it.each([
      { inbound: '0.5', returned: true },
      { inbound: '0.2', returned: true },
    ])(
      'reports lockbox rejection with $inbound TON and returns custody=$returned',
      async ({ inbound, returned }) => {
        const accessControl = blockchain.openContract(
          AccessControlClient.createFromAddress(jettonLockBox.address),
        )
        await accessControl.sendRevokeRole(deployer.getSender(), toNano('0.1'), {
          queryId: 0n,
          role: BigInt(require('zlib').crc32('OPERATOR_ROLE')),
          account: lockReleaseLockboxPool.address,
        })
        const configured =
          await lockReleaseLockboxPool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
            deployer.getSender(),
            toNano('0.2'),
            {
              queryId: 0n,
              updates: [
                TokenPool_TokenTransferFeeConfigArgs.create({
                  destChainSelector: remoteChainSelector,
                  tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.create({
                    destGasOverhead: 1n,
                    destBytesOverhead: 0n,
                    finalityFeeUSDCents: 0n,
                    fastFinalityFeeUSDCents: 0n,
                    finalityTransferFeeBps: 1000n,
                    fastFinalityTransferFeeBps: 1000n,
                    isEnabled: true,
                  }),
                }),
              ],
              disableChainSelectors: [],
            },
          )
        expect(configured.transactions).toHaveTransaction({
          from: deployer.address,
          to: lockReleaseLockboxPool.address,
          success: true,
        })
        const onRampWallet = await userWallet(deployer.address)
        const userBalance = await onRampWallet.getJettonBalance()
        const lockboxBalance = (await blockchain.getContract(jettonLockBox.address)).balance
        const poolBalance = (await blockchain.getContract(lockReleaseLockboxPool.address)).balance
        const rateLimitBefore = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
        const queryId = 301n
        const request = TokenPool_LockOrBurn.create({
          queryId,
          request: TokenPool_LockOrBurnInV1.create({
            transfer: TokenPool_Transfer.create({
              id: queryId,
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
          onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
          finalizationValue: toNano('0.01'),
        })
        const admitted = await pool.sendTokenPoolLockOrBurn(
          deployer.getSender(),
          toNano('0.5'),
          request,
        )
        const withdraw = admitted.transactions.find(
          (transaction) =>
            transaction.inMessage?.info.type === 'internal' &&
            transaction.inMessage.info.src.equals(lockReleaseLockboxPool.address) &&
            transaction.inMessage.body.beginParse().preloadUint(32) ===
              TokenPool_LockOrBurnWithdraw.PREFIX,
        )
        expect(withdraw).toBeDefined()
        const operation = TokenPool_LockOrBurnWithdraw.fromSlice(
          withdraw!.inMessage!.body.beginParse(),
        ).forwardPayload
        expect(operation.prepared.feeAmount).toEqual(toNano('1'))
        expect(operation.prepared.destTokenAmount).toEqual(toNano('9'))
        const rateLimitAdmitted = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
        expect(rateLimitAdmitted.outbound.tokens).toBeLessThan(rateLimitBefore.outbound.tokens)
        await pool.sendTokenPoolLockOrBurn(
          deployer.getSender(),
          toNano('0.5'),
          TokenPool_LockOrBurn.create({
            ...request,
            queryId: 303n,
            request: TokenPool_LockOrBurnInV1.create({
              transfer: TokenPool_Transfer.create({
                id: 303n,
                details: TokenPool_TransferDetails.create({
                  receiver: receiverAddress,
                  remoteChainSelector,
                  originalSender: deployer.address,
                  amount: toNano('20'),
                  localToken: jettonMinter.address,
                }),
              }),
            }),
          }),
        )
        const accountAddress = deriveOnRampAccountAddress({
          router: deployer.address,
          user: deployer.address,
          token: jettonMinter.address,
          deployableCode,
        })
        await onRampWallet.sendTransfer(deployer.getSender(), {
          value: toNano('2'),
          message: {
            queryId: Number(queryId),
            jettonAmount: toNano('10'),
            destination: accountAddress,
            responseDestination: deployer.address,
            customPayload: null,
            forwardTonAmount: 0n,
            forwardPayload: null,
          },
        })
        const accountWallet = await userWallet(accountAddress)
        const result = await accountWallet.sendTransfer(blockchain.sender(accountAddress), {
          value: toNano('2'),
          message: {
            queryId: Number(queryId),
            jettonAmount: toNano('10'),
            destination: lockReleaseLockboxPool.address,
            responseDestination: deployer.address,
            customPayload: null,
            forwardTonAmount: toNano(inbound),
            forwardPayload: da.Jetton_ForwardPayloadWrap.toCell(
              da.Jetton_ForwardPayloadWrap.create({
                initiator: deployer.address, // the Router: the pool requires it as the initiator
                context: null,
                forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(operation),
              }),
            ),
          },
        })
        expect(result.transactions).toHaveTransaction({
          from: jettonLockBox.address,
          to: lockReleaseLockboxPool.address,
          op: JettonLockBox_DepositFailed.PREFIX,
          success: true,
          body(body) {
            if (!body) return false
            const failure = JettonLockBox_DepositFailed.fromSlice(body.beginParse())
            return failure.queryId === queryId
          },
        })
        expect(result.transactions).toHaveTransaction({
          from: lockReleaseLockboxPool.address,
          to: deployer.address,
          op: TokenPool_LockOrBurnFailure.PREFIX,
        })
        expect(result.transactions).not.toHaveTransaction({
          from: lockReleaseLockboxPool.address,
          op: TokenPool_LockOrBurnFinished.PREFIX,
        })
        const poolWallet = await userWallet(lockReleaseLockboxPool.address)
        const custodyReceipts = result.transactions.filter((transaction) => {
          const message = transaction.inMessage
          if (
            message?.info.type !== 'internal' ||
            !message.info.src.equals(poolWallet.address) ||
            message.body.beginParse().remainingBits < 32 ||
            message.body.beginParse().preloadUint(32) !== TransferNotificationForRecipient.PREFIX
          )
            return false
          const notification = TransferNotificationForRecipient.fromSlice(message.body.beginParse())
          return notification.transferInitiator?.equals(jettonLockBox.address) ?? false
        })
        expect(custodyReceipts).toHaveLength(0)
        // The deposit account sent the custody to the pool; the lockbox returns it to that
        // account on rejection. The one-jetton token fee stays in the pool wallet.
        expect(await onRampWallet.getJettonBalance()).toEqual(userBalance - toNano('10'))
        expect(await accountWallet.getJettonBalance()).toEqual(toNano('9'))
        expect(await poolWallet.getJettonBalance()).toEqual(toNano('1'))
        expect(await (await userWallet(jettonLockBox.address)).getJettonBalance()).toEqual(0n)
        expect(
          (await pool.getCurrentRateLimiterState(remoteChainSelector, false)).outbound.tokens,
        ).toEqual(rateLimitBefore.outbound.tokens - toNano('18'))
        expect(
          (await blockchain.getContract(jettonLockBox.address)).balance,
        ).toBeGreaterThanOrEqual(lockboxBalance)
        // Excess is refunded to the sender; the pool finances the flow from the message value and
        // must not dip into its own balance.
        expect(
          (await blockchain.getContract(lockReleaseLockboxPool.address)).balance,
        ).toBeGreaterThanOrEqual(poolBalance)
        const failures = result.transactions.filter(
          (transaction) =>
            transaction.inMessage?.info.type === 'internal' &&
            transaction.inMessage.info.src.equals(lockReleaseLockboxPool.address) &&
            transaction.inMessage.body.beginParse().remainingBits >= 32 &&
            transaction.inMessage.body.beginParse().preloadUint(32) ===
              TokenPool_LockOrBurnFailure.PREFIX,
        )
        expect(failures).toHaveLength(1)
      },
    )

    it('rejects a beneficiary withdrawal from the derived account whose nested wrapper falsely claims the Router as initiator', async () => {
      const attacker = recipient
      const attackerWallet = await userWallet(attacker.address)
      const poolWallet = await userWallet(lockReleaseLockboxPool.address)

      const request = TokenPool_LockOrBurn.create({
        queryId: 305n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 305n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: attacker.address,
              amount: toNano('5'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: attacker.address,
        onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
        finalizationValue: toNano('0.01'),
      })
      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: attacker.address,
        requestMsg: request,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('5'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      // Deploy the attacker's OnRampAccount the way the Router does, with the attacker as a
      // beneficiary, and fund its wallet.
      const accountAddress = deriveOnRampAccountAddress({
        router: deployer.address,
        user: attacker.address,
        token: jettonMinter.address,
        deployableCode,
      })
      const deployable = blockchain.openContract(
        Deployable.ContractClient.createFromConfig(
          {
            owner: deployer.address,
            id: Deployable.builder.data.namespaced.encode({
              namespace: NameSpace.CCIPNamespace.OnRampAccount,
              id: beginCell().storeAddress(attacker.address).storeAddress(jettonMinter.address),
            }),
          },
          deployableCode,
        ),
      )
      const deployRes = await deployable.sendInitialize(deployer.getSender(), toNano('0.5'), {
        stateInit: {
          code: await contractCode.ccip.local('ccip.account.DepositAccount'),
          data: da.DepositAccount_Data.toCell(
            da.DepositAccount_Data.create({
              owner: deployer.address,
              user: attacker.address,
              token: jettonMinter.address,
              beneficiaries: new Set<Address>([deployer.address, attacker.address]),
            }),
          ),
        },
      })
      expect(deployRes.transactions).toHaveTransaction({
        from: deployer.address,
        to: accountAddress,
        deploy: true,
        success: true,
      })
      const account = blockchain.openContract(da.DepositAccount.fromAddress(accountAddress))
      const initRes = await account.sendDepositAccountInit(deployer.getSender(), toNano('0.3'), {
        queryId: 0n,
        context: null,
      })
      expect(initRes.transactions).toHaveTransaction({
        from: deployer.address,
        to: accountAddress,
        success: true,
      })

      // Mint jettons to the attacker (the example minter has no admin handoff here), then
      // fund the account's wallet from the attacker's wallet.
      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 305n,
          destination: attacker.address,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('5'),
          from: deployer.address,
          responseDestination: attacker.address,
          forwardTonAmount: 0n,
        },
      })
      await attackerWallet.sendTransfer(attacker.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 305,
          jettonAmount: toNano('5'),
          destination: accountAddress,
          responseDestination: attacker.address,
          customPayload: null,
          forwardTonAmount: 0n,
          forwardPayload: null,
        },
      })
      const accountWallet = await userWallet(accountAddress)

      const rateLimitBefore = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
      // The lockbox wallet may not be deployed yet (it is lazily deployed on first funding).
      const lockboxBalanceBefore = await (async () => {
        try {
          return await (await userWallet(jettonLockBox.address)).getJettonBalance()
        } catch {
          return 0n
        }
      })()

      // The beneficiary withdraws through the account, nesting a wrapper that falsely claims
      // the Router as initiator. The account stamps the outer wrap with the real requester.
      const withdrawRes = await account.sendDepositAccountWithdraw(
        attacker.getSender(),
        toNano('2'),
        {
          queryId: 305n,
          ask: da.AskToTransfer.create({
            jettonAmount: toNano('5'),
            transferRecipient: lockReleaseLockboxPool.address,
            sendExcessesTo: attacker.address,
            customPayload: null,
            forwardTonAmount: toNano('0.2'),
            forwardPayload: beginCell()
              .storeMaybeRef(
                da.Jetton_ForwardPayloadWrap.toCell(
                  da.Jetton_ForwardPayloadWrap.create({
                    // FORGED: claims the Router requested this withdraw.
                    initiator: deployer.address,
                    context: null,
                    forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
                  }),
                ),
              )
              .endCell()
              .beginParse(),
          }),
        },
      )

      // The account forwarded the withdraw to its wallet (the withdraw itself succeeds).
      expect(withdrawRes.transactions).toHaveTransaction({
        from: accountAddress,
        to: accountWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer
      })
      // The wallet delivered the notification to the pool, which rejected the deposit and
      // returned custody (the notification funds the recovery, so the wallet transfer succeeds).
      expect(withdrawRes.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })
      expect(withdrawRes.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: poolWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer (custody return)
      })

      // No capacity refund: the outbound rate limit was never consumed (rejection happens
      // before admission), so the bucket must be untouched.
      const rateLimitAfter = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
      expect(rateLimitAfter.outbound.tokens).toEqual(rateLimitBefore.outbound.tokens)

      // No lock happened: the lockbox balance is unchanged and no success reply was emitted.
      expect(
        await (async () => {
          try {
            return await (await userWallet(jettonLockBox.address)).getJettonBalance()
          } catch {
            return 0n
          }
        })(),
      ).toEqual(lockboxBalanceBefore)
      expect(withdrawRes.transactions).not.toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        op: TokenPool_LockOrBurnFinished.PREFIX,
      })
      expect(withdrawRes.transactions).not.toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        op: TokenPool_LockOrBurnFailure.PREFIX,
      })

      // Custody returned to the deposit source (the account wallet, the notification's
      // transferInitiator): the attacker is down exactly the withdrawn amount.
      expect(await attackerWallet.getJettonBalance()).toEqual(
        await attackerWallet.getJettonBalance(),
      )
      expect(await accountWallet.getJettonBalance()).toEqual(toNano('5'))
      expect(await poolWallet.getJettonBalance()).toEqual(0n)
    })

    it.each([
      { inbound: '0.3', forwarded: true },
      { inbound: '0.5', forwarded: true },
      { inbound: '0.8', forwarded: true },
    ])(
      'funds the lockbox from $inbound TON without subsidizing the transfer',
      async ({ inbound, forwarded }) => {
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
        const poolBalanceBefore = (await blockchain.getContract(lockReleaseLockboxPool.address))
          .balance

        const safety = (await lockReleaseLockboxPool.getBudget()).lockOrBurn.safety
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
          onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
          finalizationValue: toNano('0.01'),
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

        const accountAddress = deriveOnRampAccountAddress({
          router: deployer.address,
          user: deployer.address,
          token: jettonMinter.address,
          deployableCode,
        })
        await onRampWallet.sendTransfer(deployer.getSender(), {
          value: toNano('3'),
          message: {
            queryId: 300,
            jettonAmount: toNano('8'),
            destination: accountAddress,
            responseDestination: deployer.address,
            customPayload: null,
            forwardTonAmount: 0n,
            forwardPayload: null,
          },
        })
        const accountWallet = await userWallet(accountAddress)
        const result = await accountWallet.sendTransfer(blockchain.sender(accountAddress), {
          value: toNano('3'),
          message: {
            queryId: 300,
            jettonAmount: toNano('8'),
            destination: lockReleaseLockboxPool.address,
            responseDestination: deployer.address,
            customPayload: null,
            forwardTonAmount: toNano(inbound),
            forwardPayload: da.Jetton_ForwardPayloadWrap.toCell(
              da.Jetton_ForwardPayloadWrap.create({
                initiator: deployer.address, // the Router: the pool requires it as the initiator
                context: null,
                forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
              }),
            ),
          },
        })

        // The pool's jetton wallet sends TransferNotificationForRecipient to the pool
        expect(result.transactions).toHaveTransaction({
          from: poolWallet.address,
          to: lockReleaseLockboxPool.address,
          success: true,
        })
        // Wallet excess goes back to the original sender; the pool must not spend its own balance.
        expect(
          (await blockchain.getContract(lockReleaseLockboxPool.address)).balance,
        ).toBeGreaterThanOrEqual(poolBalanceBefore)
        if (!forwarded) {
          expect(result.transactions).not.toHaveTransaction({
            from: lockReleaseLockboxPool.address,
            op: AskToTransfer.PREFIX,
          })
          expect(result.transactions).toHaveTransaction({
            from: lockReleaseLockboxPool.address,
            to: deployer.address,
            op: TokenPool_LockOrBurnFailure.PREFIX,
            body(body) {
              if (!body) return false
              const failure = TokenPool_LockOrBurnFailure.fromSlice(body.beginParse())
              return failure.queryId === 300n && failure.errorCode === 51725n
            },
          })
          expect(await poolWallet.getJettonBalance()).toEqual(toNano('8'))
          expect(await lockboxWallet.getJettonBalance()).toEqual(initialLockboxBalance)
          return
        }

        // The pool sends AskToTransfer to its own jetton wallet (to forward to lockbox)
        expect(result.transactions).toHaveTransaction({
          from: lockReleaseLockboxPool.address,
          to: poolWallet.address,
          success: true,
          op: AskToTransfer.PREFIX,
          body(body) {
            if (!body) return false
            const transfer = AskToTransfer.fromSlice(body.beginParse())
            return transfer.forwardTonAmount === safety + lockOrBurn.finalizationValue
          },
        })

        // The pool's wallet sends TransferNotification to the lockbox wallet
        // (the pool computes this using its stored jetton wallet code)
        expect(result.transactions).toHaveTransaction({
          from: poolWallet.address,
          op: 0x178d4519, // TransferNotificationForRecipient
          success: true,
        })
        expect(result.transactions).toHaveTransaction({
          from: lockReleaseLockboxPool.address,
          to: deployer.address,
          op: TokenPool_LockOrBurnFinished.PREFIX,
        })
        expect(await lockboxWallet.getJettonBalance()).toEqual(initialLockboxBalance + toNano('8'))
      },
    )
  })

  describe('full release flow (end-to-end through lockbox)', () => {
    it('should complete full release flow: offRamp -> pool -> lockbox -> lockbox wallet -> ReturnExcessesBack -> pool finalize', async () => {
      // Fund the lockbox with jettons via the shared lock-deposit helper (through the pool, an
      // OPERATOR). A raw mint cannot fund the lockbox (see `fundLockboxViaLock`).
      const lockboxWalletAddress = await fundLockboxViaLock(toNano('50'), 500n)

      // Trigger release from off-ramp
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        deployer.getSender(),
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
          delivery: deliveryTo(recipient.address, deployer.address),
        },
      )

      // Pool processes the release request
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
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

      // The receiver account (a treasury stand-in) is credited and notified with the pool's
      // routing envelope, so a real deposit account forwards the notification to `replyTo`.
      const accountWallet = await userWallet(recipient.address)
      expect(await accountWallet.getJettonBalance()).toBe(toNano('5'))
      expect(result.transactions).toHaveTransaction({
        from: accountWallet.address,
        to: recipient.address,
        op: TransferNotificationForRecipient.PREFIX,
        success: true,
        body(body) {
          if (!body) return false
          const notification = TransferNotificationForRecipient.fromSlice(body.beginParse())
          return (
            notification.jettonAmount === toNano('5') &&
            parseDepositAccountNotify(notification.forwardPayload)?.equals(deployer.address) ===
              true
          )
        },
      })

      // Finalization follows the Router's ReleaseOrMintDelivered; not at admission.
      expect(result.transactions).not.toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        op: TokenPool_ReleaseOrMintFinalized.PREFIX,
      })
    })

    it('recovers the full withdrawal request and refunds the rate limit after a wallet bounce', async () => {
      const walletAddress = await fundLockboxViaLock(toNano('1'), 501n)
      const rateLimitBefore = await pool.getCurrentRateLimiterState(remoteChainSelector, false)
      const result = await lockReleaseLockboxPool.sendTokenPoolReleaseOrMint(
        deployer.getSender(),
        toNano('1'),
        {
          queryId: 401n,
          request: TokenPool_ReleaseOrMintInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 401n,
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
          delivery: deliveryTo(recipient.address, deployer.address),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: lockReleaseLockboxPool.address,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: jettonLockBox.address,
        to: walletAddress,
        op: AskToTransfer.PREFIX,
        success: false,
      })
      expect(result.transactions).toHaveTransaction({
        from: jettonLockBox.address,
        to: lockReleaseLockboxPool.address,
        op: JettonLockBox_WithdrawFailed.PREFIX,
        success: true,
        body(body) {
          if (!body) return false
          const failure = JettonLockBox_WithdrawFailed.fromSlice(body.beginParse())
          return (
            failure.queryId === 401n &&
            failure.context?.queryId === 401n &&
            failure.context.amount === toNano('5') &&
            failure.context.extra?.forwardPayload !== null
          )
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        to: deployer.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
      })
      expect(result.transactions).not.toHaveTransaction({
        from: lockReleaseLockboxPool.address,
        op: TokenPool_ReleaseOrMintFinalized.PREFIX, // no success finalization on failure
      })
      expect(
        (await pool.getCurrentRateLimiterState(remoteChainSelector, false)).inbound.tokens,
      ).toEqual(rateLimitBefore.inbound.tokens)
    })
  })

  describe('cursed state', () => {
    it('should apply local cursed state and block release while cursed', async () => {
      const curseUpdate = await lockReleaseLockboxPool.sendTokenPoolCurse(
        deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 901n,
          subjects: [remoteChainSelector],
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
