import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { crc32 } from 'zlib'
import { errorCode } from '../../../wrappers/utils'

describe('Upgradeable', () => {
  it('should compute error code', async () => {
    expect(upgradeable.Error.VersionMismatch).toBe(
      errorCode(crc32('link.chain.ton.lib.versioning.Upgradeable')),
    )
  })

  it('should have correct opcode', async () => {
    expect(upgradeable.opcodes.Upgrade).toBe(crc32('Upgradeable_Upgrade'))
  })

  it('should have correct event topic', async () => {
    expect(upgradeable.eventTopics.Upgraded).toBe(crc32('Upgradeable_UpgradedEvent'))
  })
})
