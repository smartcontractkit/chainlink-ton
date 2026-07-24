import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, Dictionary, toNano } from '@ton/core'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import { expectFailedTransaction } from '../../Logs'
import { generateRandomContractId, generateRandomTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import {
  FACILITY_NAME,
  VERSION,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/ReceiveExecutor'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import { EVM_ADDRESS } from '.././router/Router.Setup'
import { contractCode } from '../../../wrappers/codeLoader'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

export async function setupTestReceiveExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  receiveExecutorCode: Cell,
): Promise<SandboxContract<rx.ReceiveExecutor>> {
  const receiveExecutor = blockchain.openContract(
    rx.ReceiveExecutor.fromStorage(
      {
        owner: deployer.address,
        message: of.Any2TVMRampMessage.create({
          header: of.RampMessageHeader.create({
            messageId: generateRandomContractId(),
            sourceChainSelector: 0n,
            destChainSelector: 0n,
            sequenceNumber: 0n,
            nonce: 0n,
          }),
          sender: CrossChainAddressCodec.FromBuffer(EVM_ADDRESS),
          data: Cell.EMPTY,
          receiver: deployer.address,
          gasLimit: 0n,
          tokenAmounts: null,
        }),
        root: deployer.address,
        execId: 0n,
      },
      {
        overrideContractCode: receiveExecutorCode,
      },
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

describe('ReceiveExecutor', () => {
  describe('TypeAndVersion Tests', () => {
    const currentVersionSpec = TypeAndVersionSpec.newInstance({
      type: FACILITY_NAME,
      version: VERSION,
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
  describe('Unit Tests with ReceiveExecutor %s', () => {
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
        rx.ReceiveExecutor.Errors['Error.Unauthorized'],
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
        rx.ReceiveExecutor.Errors['Error.Unauthorized'],
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
        rx.ReceiveExecutor.Errors['Error.UpdatingStateOfNonExecutedMessage'],
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
        rx.ReceiveExecutor.Errors['Error.NotificationFromInvalidReceiver'],
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
        rx.ReceiveExecutor.Errors['Error.Unauthorized'],
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
        rx.ReceiveExecutor.Errors['Error.UpdatingStateOfNonExecutedMessage'],
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
        rx.ReceiveExecutor.Errors['Error.NotificationFromInvalidReceiver'],
      )
    })

    // --- Message Handling Tests ---

    it('should ignore empty messages', async () => {
      const result = await receiveExecutor.send(
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
      const result = await receiveExecutor.send(
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
      expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

      const [typeSlice] = await receiveExecutor.getTypeAndVersion()
      const type = typeSlice.loadStringTail()
      expect(type).toBe(FACILITY_NAME)

      expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
    })

    it('should match error code', async () => {
      const errorCodeVal = await receiveExecutor.getErrorCode(0n)
      expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

      expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
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
})
