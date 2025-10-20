import * as withdrawable from '../../../wrappers/libraries/funding/Withdrawable'
import { crc32 } from 'zlib'
import { errorCode } from '../../../wrappers/utils'

describe('Withdrawable', () => {
  it('should compute error code', async () => {
    expect(withdrawable.Error.InsufficientBalance).toBe(
      errorCode(crc32('com.chainlink.ton.lib.funding.Withdrawable'), 0),
    )
  })

  it('should have correct opcode', async () => {
    expect(withdrawable.opcodes.Withdraw).toBe(crc32('Withdrawable_Withdraw'))
  })
})
