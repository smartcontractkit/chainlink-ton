import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, Dictionary, toNano } from '@ton/core'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import { expectFailedTransaction } from '../../Logs'
import { generateRandomContractId, generateRandomTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as of from '../../../wrappers/ccip/OffRamp'
import * as rx from '../../../wrappers/ccip/ReceiveExecutor'
import { EVM_ADDRESS } from '.././router/Router.Setup'
import { contractCode } from '../../../wrappers/codeLoader'

export async function setupTestReceiveExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  receiveExecutorCode: Cell,
): Promise<SandboxContract<rx.ReceiveExecutor>> {
  const receiveExecutor = blockchain.openContract(
    rx.ReceiveExecutor.createFromConfig(
      {
        owner: deployer.address,
        message: {
          header: {
            messageId: generateRandomContractId(),
            sourceChainSelector: 0n,
            destChainSelector: 0n,
            sequenceNumber: 0n,
            nonce: 0n,
          },
          sender: EVM_ADDRESS,
          data: new Cell(),
          receiver: deployer.address,
          gasLimit: 0n,
          tokenAmounts: undefined,
        },
        root: deployer.address,
        execId: 0n,
        state: rx.MessageState.Untouched,
        lastExecutionTimestamp: 0n,
      },
      receiveExecutorCode,
    ),
  )
  const result = await receiveExecutor.sendDeploy(deployer.getSender(), toNano('0.05'))
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: receiveExecutor.address,
    deploy: true,
    success: true,
  })
  return receiveExecutor
}

describe('ReceiveExecutor - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(rx.opcodes.in.initExecute).toBe(0x64cd2fd2)
    expect(rx.opcodes.in.confirm).toBe(0x00e5dd97)
    expect(rx.opcodes.in.bounced).toBe(0x05dee1bb)
  })
})

describe('ReceiveExecutor', () => {
  describe('TypeAndVersion Tests', () => {
    const currentVersionSpec = TypeAndVersionSpec.newInstance({
      type: rx.FACILITY_NAME,
      version: rx.RECEIVE_EXECUTOR_CONTRACT_VERSION,
      deployContract: async (
        blockchain: Blockchain,
        deployer: SandboxContract<TreasuryContract>,
      ): Promise<SandboxContract<rx.ReceiveExecutor>> => {
        const receiveExecutorCode = await contractCode.ccip.local('ReceiveExecutor')
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
        _libs.set(BigInt(`0x${receiveExecutorCode.hash().toString('hex')}`), receiveExecutorCode)
        blockchain.libs = beginCell().storeDictDirect(_libs).endCell()
        return setupTestReceiveExecutor(blockchain, deployer, receiveExecutorCode)
      },
    })
    currentVersionSpec.run([
      {
        code: 'ReceiveExecutor',
        name: 'receive_executor',
      },
    ])
  })

  // Here we can test backwards compatibility with new message format by running the same tests with different versions of the code
  describe.each([
    {
      version: rx.RECEIVE_EXECUTOR_CONTRACT_VERSION_PREV,
      loadCode: contractCode.ccip.release_1_6_0,
    },
    { version: rx.RECEIVE_EXECUTOR_CONTRACT_VERSION, loadCode: contractCode.ccip.local },
  ])('Unit Tests with ReceiveExecutor %s', ({ version, loadCode }) => {
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
      receiveExecutorCode = await loadCode('ReceiveExecutor')
      // Populate the emulator library code
      // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
      const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())

      _libs.set(BigInt(`0x${receiveExecutorCode.hash().toString('hex')}`), receiveExecutorCode)

      const libs = beginCell().storeDictDirect(_libs).endCell()
      blockchain.libs = libs
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
      const result = await receiveExecutor.sendInitExecute(deployer.getSender(), toNano('0.05'), {
        ...defaultInitExecute,
        root: deployer.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: true,
        op: rx.opcodes.in.initExecute,
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
        op: of.opcodes.in.dispatchValidated,
      })
    })

    it('should execute InitExecute with gasOverride', async () => {
      const result = await receiveExecutor.sendInitExecute(deployer.getSender(), toNano('0.05'), {
        ...defaultInitExecute,
        root: deployer.address,
        gasOverride: toNano('0.01'),
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: true,
        op: rx.opcodes.in.initExecute,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutor.address,
        to: deployer.address,
        success: true,
        op: of.opcodes.in.dispatchValidated,
      })
    })

    it('should reject InitExecute from non-owner', async () => {
      const result = await receiveExecutor.sendInitExecute(nonOwner.getSender(), toNano('0.05'), {
        ...defaultInitExecute,
        root: deployer.address,
      })
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutor.address,
        rx.Errors.Unauthorized,
      )
    })

    // --- Confirm Tests ---

    it('should handle Confirm and send NotifySuccess to owner', async () => {
      await transitionToExecuteState()
      const result = await receiveExecutor.sendConfirm(deployer.getSender(), toNano('0.05'), {
        receiver: deployer.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: true,
        op: rx.opcodes.in.confirm,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutor.address,
        to: deployer.address,
        success: true,
        op: crc32('OffRamp_NotifySuccess'),
      })
    })

    it('should reject Confirm from non-owner', async () => {
      const result = await receiveExecutor.sendConfirm(nonOwner.getSender(), toNano('0.05'), {
        receiver: deployer.address,
      })
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutor.address,
        rx.Errors.Unauthorized,
      )
    })

    it('should reject Confirm when state is not Execute', async () => {
      const result = await receiveExecutor.sendConfirm(deployer.getSender(), toNano('0.05'), {
        receiver: deployer.address,
      })
      expectFailedTransaction(
        result,
        deployer.address,
        receiveExecutor.address,
        rx.Errors.UpdatingStateOfNonExecutedMessage,
      )
    })

    it('should reject Confirm with wrong receiver', async () => {
      await transitionToExecuteState()
      const wrongReceiver = await generateRandomTonAddress()
      const result = await receiveExecutor.sendConfirm(deployer.getSender(), toNano('0.05'), {
        receiver: wrongReceiver,
      })
      expectFailedTransaction(
        result,
        deployer.address,
        receiveExecutor.address,
        rx.Errors.NotificationFromInvalidReceiver,
      )
    })

    // --- Bounced Tests ---

    it('should handle Bounced and send NotifyFailure to owner', async () => {
      await transitionToExecuteState()
      const result = await receiveExecutor.sendBounced(deployer.getSender(), toNano('0.05'), {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: true,
        op: rx.opcodes.in.bounced,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiveExecutor.address,
        to: deployer.address,
        success: true,
        op: of.opcodes.in.notifyFailure,
      })
    })

    it('should reject Bounced from non-owner', async () => {
      const result = await receiveExecutor.sendBounced(nonOwner.getSender(), toNano('0.05'), {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      })
      expectFailedTransaction(
        result,
        nonOwner.address,
        receiveExecutor.address,
        rx.Errors.Unauthorized,
      )
    })

    it('should reject Bounced when state is not Execute', async () => {
      const result = await receiveExecutor.sendBounced(deployer.getSender(), toNano('0.05'), {
        receiver: deployer.address,
        reason: rx.ReceiveExecutor_BouncedReason.NotEnoughGas,
      })
      expectFailedTransaction(
        result,
        deployer.address,
        receiveExecutor.address,
        rx.Errors.UpdatingStateOfNonExecutedMessage,
      )
    })

    it('should reject Bounced with wrong receiver', async () => {
      await transitionToExecuteState()
      const wrongReceiver = await generateRandomTonAddress()
      const result = await receiveExecutor.sendBounced(deployer.getSender(), toNano('0.05'), {
        receiver: wrongReceiver,
        reason: rx.ReceiveExecutor_BouncedReason.BouncedFromReceiver,
      })
      expectFailedTransaction(
        result,
        deployer.address,
        receiveExecutor.address,
        rx.Errors.NotificationFromInvalidReceiver,
      )
    })

    // --- Message Handling Tests ---

    it('should ignore empty messages', async () => {
      const result = await receiveExecutor.sendInternal(
        deployer.getSender(),
        toNano('0.05'),
        beginCell().endCell(),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: true,
      })
    })

    it('should reject messages with unknown opcode', async () => {
      const result = await receiveExecutor.sendInternal(
        deployer.getSender(),
        toNano('0.05'),
        beginCell().storeUint(0xdeadbeef, 32).endCell(),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiveExecutor.address,
        success: false,
        exitCode: 0xffff,
      })
    })

    it('should match facility name and ID', async () => {
      const facilityIdVal = await receiveExecutor.getFacilityId()
      expect(facilityIdVal).toBe(BigInt(rx.FACILITY_ID))

      const { type } = await receiveExecutor.getTypeAndVersion()
      expect(type).toBe(rx.FACILITY_NAME)

      expect(rx.FACILITY_ID).toEqual(facilityId(crc32(rx.FACILITY_NAME)))
    })

    it('should match error code', async () => {
      const errorCodeVal = await receiveExecutor.getErrorCode(0n)
      expect(errorCodeVal).toBe(BigInt(rx.ERROR_CODE))

      expect(rx.ERROR_CODE).toEqual(errorCode(crc32(rx.FACILITY_NAME)))
    })

    afterAll(async () => {
      if (process.env['COVERAGE'] === 'true' && version === rx.RECEIVE_EXECUTOR_CONTRACT_VERSION) {
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
})
