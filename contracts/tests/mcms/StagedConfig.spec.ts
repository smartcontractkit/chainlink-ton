import { buildStagedConfigMessages } from '../../src/mcms/staged-config'
import * as mcms from '../../wrappers/mcms/MCMS'

const makeInput = (signerCount: number, groupCount = 1) => ({
  queryId: 1n,
  signerAddresses: Array.from({ length: signerCount }, (_, i) => BigInt(i + 1)),
  signerGroups: Array.from({ length: signerCount }, (_, i) => i % groupCount),
  groupQuorums: new Map([[0, 1]]),
  groupParents: new Map([[0, 0]]),
})

describe('buildStagedConfigMessages', () => {
  it('rejects an empty signer set', () => {
    expect(() => buildStagedConfigMessages(makeInput(0))).toThrow('at least one signer')
  })

  it('rejects more than the contract signer limit', () => {
    expect(() => buildStagedConfigMessages(makeInput(mcms.MAX_NUM_SIGNERS + 1))).toThrow(
      `maximum is ${mcms.MAX_NUM_SIGNERS}`,
    )
  })

  it('rejects mismatched signer and group lengths', () => {
    const input = makeInput(2)
    expect(() =>
      buildStagedConfigMessages({ ...input, signerGroups: input.signerGroups.slice(0, 1) }),
    ).toThrow('length mismatch')
  })

  it('rejects a chunk larger than the contract limit', () => {
    expect(() => buildStagedConfigMessages({ ...makeInput(2), chunkSize: 33 })).toThrow(
      'exceeds maximum 32',
    )
  })
})
