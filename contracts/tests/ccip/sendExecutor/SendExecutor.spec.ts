import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { facilityId } from '../../../wrappers/utils'

import { setup as ccipSendExecutor, setup } from './SendExecutor.Setup'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import { compile } from '@ton/blueprint'

describe('SendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: sx.ContractClient.type(),
    version: sx.ContractClient.version(),
    deployContract: ccipSendExecutor,
  })
  currentVersionSpec.run([
    {
      code: 'SendExecutor',
      name: 'send_executor',
    },
  ])
})

describe('SendExecutor - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(sx.opcodes.in.execute).toBe(crc32('CCIPSendExecutor_Execute'))
  })
})

describe('SendExecutor - Facility ID', () => {
  it('Test facilityId matches facility name', () => {
    expect(sx.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
      facilityId(crc32(sx.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
    )
  })
})

describe('SendExecutor - Unit tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sendExecutor: SandboxContract<sx.ContractClient>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    deployer = await blockchain.treasury('deployer')
  })

  beforeEach(async () => {
    sendExecutor = await setup(blockchain, deployer)
  })

  it('should match facility ID', async () => {
    const facilityId = await sendExecutor.getFacilityId()
    expect(facilityId).toBe(BigInt(sx.CCIP_SEND_EXECUTOR_FACILITY_ID))
  })

  it('should match error code', async () => {
    const errorCode = await sendExecutor.getErrorCode(0n)
    expect(errorCode).toBe(BigInt(sx.CCIP_SEND_EXECUTOR_ERROR_CODE))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'send_executor_unit_tests', [
        {
          code: await compile('CCIPSendExecutor'),
          name: 'send_executor',
        },
      ])
    }
  })
})
