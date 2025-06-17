import '@ton/test-utils'

import { crc32 } from 'zlib'
import { Blockchain } from '@ton/sandbox'
import { opcodes } from '../../../wrappers/lib/access/AccessControl'

describe('AccessControl', () => {
  let blockchain: Blockchain

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    // TODO: deploy and init AccessControl test contract
  })

  it('Should compute crc32 opcodes', async () => {
    // `const op = stringCrc32("some_str")` = 4013618352 = 0xEF3AF4B0
    const computed = crc32('some_str')
    expect(computed).toBe(0xef3af4b0)

    expect(opcodes.GrantRole).toBe(0x95cd540f)
    expect(opcodes.RevokeRole).toBe(0x969b0db9)
    expect(opcodes.RenounceRole).toBe(0x39452c46)
  })
})
