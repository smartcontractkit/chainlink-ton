import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { facilityId } from '../../../wrappers/utils'

import { setupTestCCIPSendExecutor } from './SendExecutor.Setup'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'

describe('CCIPSendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: sx.ContractClient.type(),
    version: sx.ContractClient.version(),
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
    expect(sx.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
      facilityId(crc32(sx.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
    )
  })
})
