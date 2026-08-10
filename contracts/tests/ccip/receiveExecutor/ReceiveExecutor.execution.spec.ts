import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, Dictionary, toNano } from '@ton/core'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import { expectFailedTransaction } from '../../Logs'
import { generateRandomTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import { contractCode } from '../../../wrappers/codeLoader'
import { setupTestReceiveExecutor } from './ReceiveExecutor.Setup'

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
        gasOverride: toNano('0.01'),
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
