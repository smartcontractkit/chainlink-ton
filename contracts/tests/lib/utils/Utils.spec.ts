import '@ton/test-utils'

import { crc32 } from 'zlib'
import * as utils from '../../../wrappers/libraries/utils/Utils'
import { facilityId } from '../../../wrappers/utils'

describe('MerkleMultiProof Unit Tests', () => {
  it('should match facility ID', async () => {
    expect(utils.FACILITY_ID).toBe(facilityId(crc32(utils.FACILITY_NAME)))
  })
})
