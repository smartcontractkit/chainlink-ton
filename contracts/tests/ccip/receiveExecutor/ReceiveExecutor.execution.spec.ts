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
import { OFFRAMP_RELEASE_OR_MINT_COST } from '../../../wrappers/ccip/OffRamp'

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
        gasOverride: of.GasOverride.create({
          receiverExecutionGasLimit: toNano('0.01'),
          tokenGasOverrides: [],
        }),
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveConfirm(
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
      op: rx.ReceiveExecutor_CCIPReceiveConfirm.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: crc32('OffRamp_NotifySuccess'),
    })
  })

  it('should reject Confirm from non-owner', async () => {
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveConfirm(
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveConfirm(
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveConfirm(
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveFailed(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_FailedReason.NotEnoughGas,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiveExecutor.address,
      success: true,
      op: rx.ReceiveExecutor_CCIPReceiveFailed.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: receiveExecutor.address,
      to: deployer.address,
      success: true,
      op: of.OffRamp_NotifyFailure.PREFIX,
    })
  })

  it('should reject Bounced from non-owner', async () => {
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveFailed(
      nonOwner.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_FailedReason.NotEnoughGas,
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveFailed(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_FailedReason.NotEnoughGas,
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
    const result = await receiveExecutor.sendReceiveExecutorCCIPReceiveFailed(
      deployer.getSender(),
      toNano('0.05'),
      {
        receiver: wrongReceiver,
        reason: rx.ReceiveExecutor_FailedReason.BouncedFromReceiver,
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

    let messageWithTT: of.Any2TVMRampMessage

    /** InitExecute -> queries the TokenAdminRegistry. */
    async function initExecuteQueriesRegistry(executor: SandboxContract<rx.ReceiveExecutor>) {
      const result = await executor.sendReceiveExecutorInitExecute(
        deployer.getSender(),
        toNano('1'),
        {
          ...defaultInitExecute,
          root: deployer.address,
          tokenTransfers: [
            rx.ReceiveExecutor_TokenTransfer.create({
              tokenAdminRegistry: tokenAdminRegistry.address,
              transfer: messageWithTT.tokenAmounts![0],
            }),
          ],
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: executor.address,
        to: tokenAdminRegistry.address,
        success: true,
        op: rx.TokenRegistry_GetTokenInfo.PREFIX,
      })
      return result
    }

    /** TokenAdminRegistry returns a token pool -> sends ReleaseOrMint. */
    async function returnTokenInfoWithPool(executor: SandboxContract<rx.ReceiveExecutor>) {
      const result = await executor.sendTokenRegistryReturnTokenInfo(
        tokenAdminRegistry.getSender(),
        toNano('1'),
        {
          minterAddress: deployer.address,
          tokenPool: tokenPool.address,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: executor.address,
        to: deployer.address,
        success: true,
        op: of.OffRamp_ReleaseOrMint.PREFIX,
      })
      return result
    }

    describe('ReceiveExecutor - Pure Token Transfers (No data)', () => {
      let receiveExecutorWithToken: SandboxContract<rx.ReceiveExecutor>

      beforeEach(async () => {
        tokenAdminRegistry = await blockchain.treasury('tokenAdminRegistry')
        tokenPool = await blockchain.treasury('tokenPool')
        messageWithTT = createTestMessageWithToken({ receiver: deployer.address })
        receiveExecutorWithToken = await setupTestReceiveExecutor(
          blockchain,
          deployer,
          receiveExecutorCode,
          messageWithTT,
        )
      })

      // --- InitExecute with token transfer ---

      it('should query TokenAdminRegistry when InitExecute has a token transfer', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
      })

      it('should reject InitExecute with token transfer from non-owner', async () => {
        const result = await receiveExecutorWithToken.sendReceiveExecutorInitExecute(
          nonOwner.getSender(),
          toNano('0.05'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
          },
        )
        expectFailedTransaction(
          result,
          nonOwner.address,
          receiveExecutorWithToken.address,
          rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
        )
      })

      // --- TokenAdminRegistry response ---

      it('should send ReleaseOrMint when TokenAdminRegistry returns a token pool', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
      })

      it('should send NotifyFailure when TokenAdminRegistry returns no token pool', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
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
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
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
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
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
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
        const result = await receiveExecutorWithToken.sendTokenPoolReleaseOrMintFailure(
          tokenPool.getSender(),
          toNano('0.05'),
          {
            errorCode: 1n,
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorWithToken.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_NotifyFailure.PREFIX,
        })
      })

      it('should reject ReleaseOrMintFinished from non-tokenPool', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
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
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
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

      // --- ReleaseOrMintBounced (from owner) ---

      it('should send NotifyFailure when ReleaseOrMintBounced', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
        const result = await receiveExecutorWithToken.sendReleaseOrMintReleaseOrMintFailed(
          deployer.getSender(),
          toNano('0.05'),
          {
            reason: rx.ReleaseOrMintBounced.create({ exitCode: 1n }),
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: receiveExecutorWithToken.address,
          success: true,
          op: rx.ReleaseOrMint_ReleaseOrMintFailed.PREFIX,
        })
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorWithToken.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_NotifyFailure.PREFIX,
        })
      })

      it('should reject ReleaseOrMintBounced from non-owner', async () => {
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
        const result = await receiveExecutorWithToken.sendReleaseOrMintReleaseOrMintFailed(
          nonOwner.getSender(),
          toNano('0.05'),
          {
            reason: rx.ReleaseOrMintBounced.create({ exitCode: 1n }),
          },
        )
        expectFailedTransaction(
          result,
          nonOwner.address,
          receiveExecutorWithToken.address,
          rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.Unauthorized'],
        )
      })

      it('should reject ReleaseOrMintBounced when state is not ReleaseOrMint', async () => {
        const result = await receiveExecutorWithToken.sendReleaseOrMintReleaseOrMintFailed(
          deployer.getSender(),
          toNano('0.05'),
          {
            reason: rx.ReleaseOrMintBounced.create({ exitCode: 1n }),
          },
        )
        expectFailedTransaction(
          result,
          deployer.address,
          receiveExecutorWithToken.address,
          rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.TokenPoolUnexpectedResponse'],
        )
      })

      // --- Retry flows ---

      it('should re-query TokenAdminRegistry when retrying from TokenAdminRegistryQueryFailed', async () => {
        // First query fails because no token pool is returned.
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await receiveExecutorWithToken.sendTokenRegistryReturnTokenInfo(
          tokenAdminRegistry.getSender(),
          toNano('0.05'),
          {
            minterAddress: deployer.address,
            tokenPool: null,
          },
        )

        // Retry InitExecute: should query TokenAdminRegistry again.
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
      })

      it('should send ReleaseOrMint when retrying from TokenTransferFailed', async () => {
        // First transfer fails.
        await initExecuteQueriesRegistry(receiveExecutorWithToken)
        await returnTokenInfoWithPool(receiveExecutorWithToken)
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
          toNano('1'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorWithToken.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_ReleaseOrMint.PREFIX,
        })
      })

      // --- gasOverride with token transfers ---

      it('should use tokenGasOverride for releaseOrMint when greater than destGasAmount', async () => {
        messageWithTT = createTestMessageWithToken({
          receiver: deployer.address,
          destGasAmount: toNano('0.001'),
        })
        // Deploy a ReceiveExecutor with a token transfer that has a low destGasAmount.
        const receiveExecutorLowGas = await setupTestReceiveExecutor(
          blockchain,
          deployer,
          receiveExecutorCode,
          messageWithTT,
        )

        // InitExecute with a gasOverride that has a higher tokenGasOverride.
        const tokenGasOverride = messageWithTT.tokenAmounts![0].destGasAmount + toNano('0.01')
        await receiveExecutorLowGas.sendReceiveExecutorInitExecute(
          deployer.getSender(),
          toNano('1'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
            gasOverride: of.GasOverride.create({
              receiverExecutionGasLimit: toNano('0.01'),
              tokenGasOverrides: [tokenGasOverride],
            }),
          },
        )

        // TokenAdminRegistry returns a token pool -> ReleaseOrMint.
        const result = await receiveExecutorLowGas.sendTokenRegistryReturnTokenInfo(
          tokenAdminRegistry.getSender(),
          toNano('0.05'),
          {
            minterAddress: deployer.address,
            tokenPool: tokenPool.address,
          },
        )
        // The ReleaseOrMint message should be sent successfully.
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorLowGas.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_ReleaseOrMint.PREFIX,
          value: tokenGasOverride + OFFRAMP_RELEASE_OR_MINT_COST, // The value sent should be more than tokenGasOverride.
          body(x) {
            if (x == undefined) throw new Error('ReleaseOrMint body is undefined')
            const msg = of.OffRamp_ReleaseOrMint.fromSlice(x.beginParse())
            expect(msg.destGasAmount).toEqual(tokenGasOverride) // The destGasAmount should be the tokenGasOverride.
            return true
          },
        })
      })

      it('should use destGasAmount for releaseOrMint when tokenGasOverride is lower', async () => {
        const destGasAmount = toNano('0.01')
        messageWithTT = createTestMessageWithToken({ receiver: deployer.address, destGasAmount })
        const receiveExecutorHighGas = await setupTestReceiveExecutor(
          blockchain,
          deployer,
          receiveExecutorCode,
          messageWithTT,
        )

        // InitExecute with a gasOverride that has a lower tokenGasOverride.
        await receiveExecutorHighGas.sendReceiveExecutorInitExecute(
          deployer.getSender(),
          toNano('1'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
            gasOverride: of.GasOverride.create({
              receiverExecutionGasLimit: toNano('0.01'),
              tokenGasOverrides: [destGasAmount - toNano('0.001')],
            }),
          },
        )

        const result = await receiveExecutorHighGas.sendTokenRegistryReturnTokenInfo(
          tokenAdminRegistry.getSender(),
          toNano('0.05'),
          {
            minterAddress: deployer.address,
            tokenPool: tokenPool.address,
          },
        )
        // The ReleaseOrMint message should be sent successfully.
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorHighGas.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_ReleaseOrMint.PREFIX,
          value: destGasAmount + OFFRAMP_RELEASE_OR_MINT_COST, // The value sent should be more than destGasAmount.
          body(x) {
            if (x == undefined) throw new Error('ReleaseOrMint body is undefined')
            const msg = of.OffRamp_ReleaseOrMint.fromSlice(x.beginParse())
            expect(msg.destGasAmount).toEqual(destGasAmount) // The destGasAmount should be the destGasAmount.
            return true
          },
        })
      })
    })

    describe('ReceiveExecutor - PTT', () => {
      let tokenAdminRegistry: SandboxContract<TreasuryContract>
      let tokenPool: SandboxContract<TreasuryContract>
      let receiveExecutorPtt: SandboxContract<rx.ReceiveExecutor>

      beforeEach(async () => {
        tokenAdminRegistry = await blockchain.treasury('tokenAdminRegistry')
        tokenPool = await blockchain.treasury('tokenPool')
        messageWithTT = createTestMessageWithToken({
          receiver: deployer.address,
          data: beginCell().storeUint(0xdeadbeef, 32).endCell(),
        })
        receiveExecutorPtt = await setupTestReceiveExecutor(
          blockchain,
          deployer,
          receiveExecutorCode,
          messageWithTT,
        )
      })

      // A PTT message carries both a token transfer and data, so after the token
      // transfer completes the message is executed (DispatchValidated) instead of
      // being finalized with NotifySuccess.
      async function transitionToPttExecute() {
        await initExecuteQueriesRegistry(receiveExecutorPtt)
        await returnTokenInfoWithPool(receiveExecutorPtt)
        const finishedResult = await receiveExecutorPtt.sendTokenPoolReleaseOrMintFinished(
          tokenPool.getSender(),
          toNano('0.05'),
          {
            out: rx.TokenPool_ReleaseOrMintOutV1.create({
              destinationAmount: 1000n,
            }),
          },
        )
        expect(finishedResult.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_DispatchValidated.PREFIX,
        })
        return finishedResult
      }

      it('should execute the message after the token transfer completes', async () => {
        await transitionToPttExecute()
      })

      it('should send NotifySuccess on Confirm after PTT execution', async () => {
        await transitionToPttExecute()
        const result = await receiveExecutorPtt.sendReceiveExecutorCCIPReceiveConfirm(
          deployer.getSender(),
          toNano('0.05'),
          {
            receiver: deployer.address,
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_NotifySuccess.PREFIX,
        })
      })

      it('should send NotifyFailure on Bounced after PTT execution', async () => {
        await transitionToPttExecute()
        const result = await receiveExecutorPtt.sendReceiveExecutorCCIPReceiveFailed(
          deployer.getSender(),
          toNano('0.05'),
          {
            receiver: deployer.address,
            reason: rx.ReceiveExecutor_FailedReason.NotEnoughGas,
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_NotifyFailure.PREFIX,
        })
      })

      it('should retry the message execution when retrying from ExecuteFailed', async () => {
        // Execute the message, then bounce it to set ExecuteFailed.
        await transitionToPttExecute()
        await receiveExecutorPtt.sendReceiveExecutorCCIPReceiveFailed(
          deployer.getSender(),
          toNano('0.05'),
          {
            receiver: deployer.address,
            reason: rx.ReceiveExecutor_FailedReason.NotEnoughGas,
          },
        )

        // Retry InitExecute: token transfer is already done (TokenTransferSuccess),
        // so it should re-execute the message (DispatchValidated).
        const result = await receiveExecutorPtt.sendReceiveExecutorInitExecute(
          deployer.getSender(),
          toNano('1'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_DispatchValidated.PREFIX,
        })
      })

      // --- PTT retry flows ---
      // When a PTT message fails during the token transfer phase, the retry must
      // resume the token transfer AND then continue to execute the message.

      it('should retry both token transfer and execution when retrying from TokenAdminRegistryQueryFailed', async () => {
        // First query fails because no token pool is returned.
        await initExecuteQueriesRegistry(receiveExecutorPtt)
        await receiveExecutorPtt.sendTokenRegistryReturnTokenInfo(
          tokenAdminRegistry.getSender(),
          toNano('0.05'),
          {
            minterAddress: deployer.address,
            tokenPool: null,
          },
        )

        // Retry InitExecute: should re-query TokenAdminRegistry, then resume the
        // token transfer and finally execute the message.
        await initExecuteQueriesRegistry(receiveExecutorPtt)
        await returnTokenInfoWithPool(receiveExecutorPtt)
        const finishedResult = await receiveExecutorPtt.sendTokenPoolReleaseOrMintFinished(
          tokenPool.getSender(),
          toNano('0.05'),
          {
            out: rx.TokenPool_ReleaseOrMintOutV1.create({
              destinationAmount: 1000n,
            }),
          },
        )
        expect(finishedResult.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_DispatchValidated.PREFIX,
        })
      })

      it('should retry both token transfer and execution when retrying from ReleaseOrMintFailed', async () => {
        // First transfer fails.
        await initExecuteQueriesRegistry(receiveExecutorPtt)
        await returnTokenInfoWithPool(receiveExecutorPtt)
        await receiveExecutorPtt.sendTokenPoolReleaseOrMintFailure(
          tokenPool.getSender(),
          toNano('0.05'),
          {
            errorCode: 1n,
          },
        )

        // Retry InitExecute: should send ReleaseOrMint directly, then execute the message.
        const retryResult = await receiveExecutorPtt.sendReceiveExecutorInitExecute(
          deployer.getSender(),
          toNano('1'),
          {
            ...defaultInitExecute,
            root: deployer.address,
            tokenTransfers: [
              rx.ReceiveExecutor_TokenTransfer.create({
                tokenAdminRegistry: tokenAdminRegistry.address,
                transfer: messageWithTT.tokenAmounts![0],
              }),
            ],
          },
        )
        expect(retryResult.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_ReleaseOrMint.PREFIX,
        })
        const finishedResult = await receiveExecutorPtt.sendTokenPoolReleaseOrMintFinished(
          tokenPool.getSender(),
          toNano('0.05'),
          {
            out: rx.TokenPool_ReleaseOrMintOutV1.create({
              destinationAmount: 1000n,
            }),
          },
        )
        expect(finishedResult.transactions).toHaveTransaction({
          from: receiveExecutorPtt.address,
          to: deployer.address,
          success: true,
          op: of.OffRamp_DispatchValidated.PREFIX,
        })
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
