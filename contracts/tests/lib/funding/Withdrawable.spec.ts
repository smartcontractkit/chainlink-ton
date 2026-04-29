import * as withdrawable from '../../../wrappers/libraries/funding/Withdrawable'
import { crc32 } from 'zlib'

describe('Withdrawable', () => {
  it('should have correct opcode', async () => {
    expect(withdrawable.opcodes.Withdraw).toBe(crc32('Withdrawable_Withdraw'))
  })
})
