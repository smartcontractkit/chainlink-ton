import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import { FACILITY_NAME, FACILITY_ID, ERROR_CODE } from '../../../wrappers/ccip/ReceiveExecutor'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import { contractCode } from '../../../wrappers/codeLoader'
import { setupTestReceiveExecutor } from './ReceiveExecutor.Setup'

describe('ReceiveExecutor', () => {
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
