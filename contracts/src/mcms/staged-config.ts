import type { Cell } from '@ton/core'

import { mcms } from '../../wrappers/mcms'

export type StagedConfigMessages = {
  begin: Cell
  stages: Cell[]
  commit: Cell
}

export type StagedConfigInput = {
  queryId: bigint
  signerAddresses: bigint[]
  signerGroups: number[]
  groupQuorums: Map<number, number>
  groupParents: Map<number, number>
  clearRoot?: boolean
  chunkSize?: number
}

export function buildStagedConfigMessages(input: StagedConfigInput): StagedConfigMessages {
  const chunkSize = input.chunkSize ?? mcms.MAX_SIGNERS_PER_STAGE
  if (input.signerAddresses.length === 0) {
    throw new Error('MCMS config must contain at least one signer')
  }
  if (input.signerAddresses.length !== input.signerGroups.length) {
    throw new Error('signer addresses and groups length mismatch')
  }
  if (chunkSize <= 0) {
    throw new Error('chunk size must be greater than zero')
  }

  const begin = mcms.builder.message.in.beginConfigStaging
    .encode({
      queryId: input.queryId,
      groupQuorums: input.groupQuorums,
      groupParents: input.groupParents,
    })
    .endCell()

  const stages: Cell[] = []
  for (let offset = 0; offset < input.signerAddresses.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, input.signerAddresses.length)
    stages.push(
      mcms.builder.message.in.stageConfig
        .encode({
          queryId: input.queryId,
          expectedNumSigners: offset,
          signerAddresses: input.signerAddresses.slice(offset, end),
          signerGroups: input.signerGroups.slice(offset, end),
        })
        .endCell(),
    )
  }

  const commit = mcms.builder.message.in.commitConfig
    .encode({
      queryId: input.queryId,
      expectedNumSigners: input.signerAddresses.length,
      clearRoot: input.clearRoot ?? false,
    })
    .endCell()

  return { begin, stages, commit }
}
