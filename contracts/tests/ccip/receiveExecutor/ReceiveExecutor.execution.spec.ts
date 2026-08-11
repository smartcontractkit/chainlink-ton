import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import { expectFailedTransaction } from '../../Logs'
import { generateRandomTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import { contractCode } from '../../../wrappers/codeLoader'
import { createTestMessageWithToken, setupTestReceiveExecutor } from './ReceiveExecutor.Setup'

describe('ReceiveExecutor - Execution', () => {
  // Here we can test backwards compatibility with new message format by running the same tests with different versions of the code
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let nonOwner: SandboxContract<TreasuryContract>
  let receiveExecutorCode: Cell
  let receiveExecutor: SandboxContract<rx.ReceiveExecutor>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    blockchain.now = 10000
    deployer = await blockchain.treasury('deployer')
    nonOwner = await blockchain.treasury('nonOwner')
    receiveExecutorCode = await contractCode.ccip.local('ReceiveExecutor')
  })

  beforeEach(async () => {
    receiveExecutor = await setupTestReceiveExecutor(blockchain, deployer, receiveExecutorCode)
  })

  const defaultInitExecute = {
    sequenceNumber: 0n,
    sourceChainSelector: 0n,
    messageId: 0n,
  }

  async function transitionToExecuteState() {
    const result = await receiveExecutor.sendReceiveExecutorInitExecute(
      deployer.getSender(),
      toNano('0.05'),
      {
        ...defaultInitExecute,
        root: deployer.address,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiveExecutor.address,
      success: true,
      op: rx.ReceiveExecutor_InitExecute.PREFIX,
    })
    return result
  }

  // --- InitExecute Tests ---

  it('should execute InitExecute and send DispatchValidated to owner', async () => {
    const result = await transitionToExecuteState()
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: of.OffRamp_DispatchValidated.PREFIX,
    })
  })

  it('should execute InitExecute with gasOverride', async () => {
    const result = await receiveExecutor.sendReceiveExecutorInitExecute(
      deployer.getSender(),
      toNano('0.05'),
      {
        ...defaultInitExecute,
        root: deployer.address,
        gasOverride: of.GasOverride.create({ receiverExecutionGasLimit: toNano('0.01') }),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiveExecutor.address,
      success: true,
      op: rx.ReceiveExecutor_InitExecute.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: of.OffRamp_DispatchValidated.PREFIX,
    })
  })

  it('should reject InitExecute from non-owner', async () => {
    const result = await receiveExecutor.sendReceiveExecutorInitExecute(
      nonOwner.getSender(),
      toNano('0.05'),
      {
        ...defaultInitExecute,
        root: deployer.address,
      },
    )
    expectFailedTransaction(
      result,
      nonOwner.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
    )
  })

  // --- Confirm Tests ---

  it('should handle Confirm and send NotifySuccess to owner', async () => {
    await transitionToExecuteState()
    const result = await receiveExecutor.sendReceiveExecutorConfirm(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiveExecutor.address,
      success: true,
      op: rx.ReceiveExecutor_Confirm.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: crc32('OffRamp_NotifySuccess'),
    })
  })

  it('should reject Confirm from non-owner', async () => {
    const result = await receiveExecutor.sendReceiveExecutorConfirm(
      nonOwner.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
      },
    )
    expectFailedTransaction(
      result,
      nonOwner.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
    )
  })

  it('should reject Confirm when state is not Execute', async () => {
    const result = await receiveExecutor.sendReceiveExecutorConfirm(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
      },
    )
    expectFailedTransaction(
      result,
      deployer.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage'],
    )
  })

  it('should reject Confirm with wrong receiver', async () => {
    await transitionToExecuteState()
    const wrongReceiver = await generateRandomTonAddress()
    const result = await receiveExecutor.sendReceiveExecutorConfirm(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: wrongReceiver,
      },
    )
    expectFailedTransaction(
      result,
      deployer.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.NotificationFromInvalidReceiver'],
    )
  })

  // --- Bounced Tests ---

  it('should handle Bounced and send NotifyFailure to owner', async () => {
    await transitionToExecuteState()
    const result = await receiveExecutor.sendReceiveExecutorBounced(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiveExecutor.address,
      success: true,
      op: rx.ReceiveExecutor_Bounced.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: of.OffRamp_NotifyFailure.PREFIX,
    })
  })

  it('should reject Bounced from non-owner', async () => {
    const result = await receiveExecutor.sendReceiveExecutorBounced(
      nonOwner.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      },
    )
    expectFailedTransaction(
      result,
      nonOwner.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
    )
  })

  it('should reject Bounced when state is not Execute', async () => {
    const result = await receiveExecutor.sendReceiveExecutorBounced(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      },
    )
    expectFailedTransaction(
      result,
      deployer.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage'],
    )
  })

  it('should reject Bounced with wrong receiver', async () => {
    await transitionToExecuteState()
    const wrongReceiver = await generateRandomTonAddress()
    const result = await receiveExecutor.sendReceiveExecutorBounced(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: wrongReceiver,
        reason: rx.ReceiveExecutor_BouncedReason.BouncedFromReceiver,
      },
    )
    expectFailedTransaction(
      result,
      deployer.address,
      receiveExecutor.address,
      rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.NotificationFromInvalidReceiver'],
    )
  })

  // --- Token Transfer Tests ---

  describe('ReceiveExecutor - Token Transfers', () => {
    let tokenAdminRegistry: SandboxContract<TreasuryContract>
    let tokenPool: SandboxContract<TreasuryContract>
    let receiveExecutorWithToken: SandboxContract<rx.ReceiveExecutor>

    beforeEach(async () => {
      tokenAdminRegistry = await blockchain.treasury('tokenAdminRegistry')
      tokenPool = await blockchain.treasury('tokenPool')
      receiveExecutorWithToken = await setupTestReceiveExecutor(
        blockchain,
        deployer,
        receiveExecutorCode,
        createTestMessageWithToken({ receiver: deployer.address }),
      )
    })

    async function transitionToTokenAdminRegistryQuery() {
      const result = await receiveExecutorWithToken.sendReceiveExecutorInitExecute(
        deployer.getSender(),
        toNano('0.05'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenAdminRegistry: tokenAdminRegistry.address,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutorWithToken.address,
        success: true,
        op: rx.ReceiveExecutor_InitExecute.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: tokenAdminRegistry.address,
        success: true,
        op: rx.TokenRegistry_GetTokenInfo.PREFIX,
      })
      return result
    }

    async function transitionToTokenTransfer() {
      await transitionToTokenAdminRegistryQuery()
      const result = await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
        tokenAdminRegistry.getSender(),
        toNano('0.05'),
        {
          minterAddress: deployer.address,
          tokenPool: tokenPool.address,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: tokenAdminRegistry.address,
        to: receiveExecutorWithToken.address,
        success: true,
        op: rx.TokenRegistry_ReturnTokenInfo.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_ReleaseOrMint.PREFIX,
      })
      return result
    }

    // --- InitExecute with token transfer ---

    it('should query TokenAdminRegistry when InitExecute has a token transfer', async () => {
      await transitionToTokenAdminRegistryQuery()
    })

    it('should reject InitExecute with token transfer from non-owner', async () => {
      const result = await receiveExecutorWithToken.sendReceiveExecutorInitExecute(
        nonOwner.getSender(),
        toNano('0.05'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenAdminRegistry: tokenAdminRegistry.address,
        },
      )
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
      )
    })

    // TODO remove when PTT is supported
    it('should reject InitExecute when message has both data and a token transfer', async () => {
      const receiveExecutorWithDataAndToken = await setupTestReceiveExecutor(
        blockchain,
        deployer,
        receiveExecutorCode,
        createTestMessageWithToken({
          receiver: deployer.address,
          data: beginCell().storeUint(0xdeadbeef, 32).endCell(),
        }),
      )
      const result = await receiveExecutorWithDataAndToken.sendReceiveExecutorInitExecute(
        deployer.getSender(),
        toNano('0.05'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenAdminRegistry: tokenAdminRegistry.address,
        },
      )
      expectFailedTransaction(
        result,
        deployer.address,
        receiveExecutorWithDataAndToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.PTTNotSupported'],
      )
    })

    // --- TokenAdminRegistry response ---

    it('should send ReleaseOrMint when TokenAdminRegistry returns a token pool', async () => {
      await transitionToTokenTransfer()
    })

    it('should send NotifyFailure when TokenAdminRegistry returns no token pool', async () => {
      await transitionToTokenAdminRegistryQuery()
      const result = await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
        tokenAdminRegistry.getSender(),
        toNano('0.05'),
        {
          minterAddress: deployer.address,
          tokenPool: null,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: tokenAdminRegistry.address,
        to: receiveExecutorWithToken.address,
        success: true,
        op: rx.TokenRegistry_ReturnTokenInfo.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_NotifyFailure.PREFIX,
      })
    })

    it('should reject ReturnTokenInfo from non-tokenAdminRegistry', async () => {
      await transitionToTokenAdminRegistryQuery()
      const result = await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
        nonOwner.getSender(),
        toNano('0.05'),
        {
          minterAddress: deployer.address,
          tokenPool: tokenPool.address,
        },
      )
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
      )
    })

    it('should reject ReturnTokenInfo when state is not TokenAdminRegistryQuery', async () => {
      const result = await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
        tokenAdminRegistry.getSender(),
        toNano('0.05'),
        {
          minterAddress: deployer.address,
          tokenPool: tokenPool.address,
        },
      )
      expectFailedTransaction(
        result,
        tokenAdminRegistry.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.TokenAdminRegistryUnexpectedResponse'],
      )
    })

    // --- TokenPool release/mint response ---

    it('should send NotifySuccess when ReleaseOrMintFinished', async () => {
      await transitionToTokenTransfer()
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFinished(
        tokenPool.getSender(),
        toNano('0.05'),
        {
          out: rx.TokenPool_ReleaseOrMintOutV1.create({
            destinationAmount: 1000n,
          }),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: tokenPool.address,
        to: receiveExecutorWithToken.address,
        success: true,
        op: rx.TokenPool_ReleaseOrMintFinished.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_NotifySuccess.PREFIX,
      })
    })

    it('should send NotifyFailure when ReleaseOrMintFailure', async () => {
      await transitionToTokenTransfer()
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFailure(
        tokenPool.getSender(),
        toNano('0.05'),
        {
          errorCode: 1n,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: tokenPool.address,
        to: receiveExecutorWithToken.address,
        success: true,
        op: rx.TokenPool_ReleaseOrMintFailure.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_NotifyFailure.PREFIX,
      })
    })

    it('should reject ReleaseOrMintFinished from non-tokenPool', async () => {
      await transitionToTokenTransfer()
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFinished(
        nonOwner.getSender(),
        toNano('0.05'),
        {
          out: rx.TokenPool_ReleaseOrMintOutV1.create({
            destinationAmount: 1000n,
          }),
        },
      )
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
      )
    })

    it('should reject ReleaseOrMintFailure from non-tokenPool', async () => {
      await transitionToTokenTransfer()
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFailure(
        nonOwner.getSender(),
        toNano('0.05'),
        {
          errorCode: 1n,
        },
      )
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
      )
    })

    it('should reject ReleaseOrMintFinished when state is not TokenTransfer', async () => {
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFinished(
        tokenPool.getSender(),
        toNano('0.05'),
        {
          out: rx.TokenPool_ReleaseOrMintOutV1.create({
            destinationAmount: 1000n,
          }),
        },
      )
      expectFailedTransaction(
        result,
        tokenPool.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.TokenPoolUnexpectedResponse'],
      )
    })

    it('should reject ReleaseOrMintFailure when state is not TokenTransfer', async () => {
      const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFailure(
        tokenPool.getSender(),
        toNano('0.05'),
        {
          errorCode: 1n,
        },
      )
      expectFailedTransaction(
        result,
        tokenPool.address,
        receiveExecutorWithToken.address,
        rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.TokenPoolUnexpectedResponse'],
      )
    })

    // --- Retry flows ---

    it('should re-query TokenAdminRegistry when retrying from TokenAdminRegistryQueryFailed', async () => {
      // First query fails because no token pool is returned.
      await transitionToTokenAdminRegistryQuery()
      await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
        tokenAdminRegistry.getSender(),
        toNano('0.05'),
        {
          minterAddress: deployer.address,
          tokenPool: null,
        },
      )

      // Retry InitExecute: should query TokenAdminRegistry again.
      const result = await receiveExecutorWithToken.sendReceiveExecutorInitExecute(
        deployer.getSender(),
        toNano('0.05'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenAdminRegistry: tokenAdminRegistry.address,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: tokenAdminRegistry.address,
        success: true,
        op: rx.TokenRegistry_GetTokenInfo.PREFIX,
      })
    })

    it('should send ReleaseOrMint when retrying from TokenTransferFailed', async () => {
      // First transfer fails.
      await transitionToTokenTransfer()
      await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFailure(
        tokenPool.getSender(),
        toNano('0.05'),
        {
          errorCode: 1n,
        },
      )

      // Retry InitExecute: should send ReleaseOrMint directly.
      const result = await receiveExecutorWithToken.sendReceiveExecutorInitExecute(
        deployer.getSender(),
        toNano('0.05'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenAdminRegistry: tokenAdminRegistry.address,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutorWithToken.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_ReleaseOrMint.PREFIX,
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      // Skip coverage for old version
      const testSuitePrefix = 'receive_executor_unit_tests'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: receiveExecutorCode,
          name: 'receive_executor',
        },
      ])
    }
  })
})
