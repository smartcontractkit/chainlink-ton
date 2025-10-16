import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { crc32 } from 'zlib'
import { errorCode } from '../../../wrappers/utils'

describe('Upgradeable', () => {
  it('should compute error code', async () => {
    expect(upgradeable.Error.VersionMismatch).toBe(
      errorCode(crc32('com.chainlink.ton.lib.versioning.Upgradeable'), 0),
    )
  })
})
