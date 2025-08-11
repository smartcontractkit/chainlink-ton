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

    // In opcodes
    expect(opcodes.in.GrantRole).toBe(0x95cd540f)
    expect(opcodes.in.RevokeRole).toBe(0x969b0db9)
    expect(opcodes.in.RenounceRole).toBe(0x39452c46)

    // Out opcodes
    expect(opcodes.out.RoleGranted).toBe(0xcf3ca837)
    expect(opcodes.out.RoleRevoked).toBe(0x990fe1c7)
    expect(opcodes.out.RoleAdminChanged).toBe(0xbd7e8bce)
  })
})
