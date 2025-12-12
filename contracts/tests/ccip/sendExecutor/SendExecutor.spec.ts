import * as e from '../../../wrappers/ccip/CCIPSendExecutor'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as coverage from '../../coverage/coverage'
import { crc32 } from 'zlib'
import { facilityId } from '../../../wrappers/utils'
import { setupTestCCIPSendExecutor } from './SendExecutor.Setup'

describe('CCIPSendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: e.ContractClient.type(),
    version: e.ContractClient.version(),
    deployContract: setupTestCCIPSendExecutor,
  })
  currentVersionSpec.run([
    {
      code: 'CCIPSendExecutor',
      name: 'send_executor',
    },
  ])
})

describe('CCIPSendExecutor - Wrapper', () => {
  it('Test facilityId matches facility name', () => {
    expect(e.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
      facilityId(crc32(e.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
    )
  })
})
