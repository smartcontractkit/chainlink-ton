import { Cell, beginCell } from '@ton/core'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import { asSnakedCell } from '../../../../src/utils'

// `MaxDataBytes` of the FeeQuoter dest chain config TON lanes are deployed with
// (deployment/ccip/1_6_0/sequences/connect_chains.go).
export const LANE_MAX_DATA_BYTES = 2000
// The contracts reject data over MAX_DATA_CELLS (lib/utils.tolk); 127 bytes fit in a cell. The
// CCIP min values are calibrated for a message of this size.
export const HARD_MAX_DATA_BYTES = 256 * 127
export const SEND_DATA_SIZE_SWEEP = [0, LANE_MAX_DATA_BYTES, 8000, 16256, HARD_MAX_DATA_BYTES]
export const MAX_EXTRA_ARGS_SIZE = 500 // bytes
export const MESSAGE_COUNT_IN_COMMIT = 10 // messages per commit report

export function createMaxPayload(): Cell {
  return createPayload(HARD_MAX_DATA_BYTES)
}

// Snake of 127-byte cells filled with 0xff.
export function createPayload(size: number): Cell {
  const data = Buffer.alloc(size, 0xff)
  const chunks: Buffer[] = []
  const MAX_BYTES_PER_CELL = 127
  for (let i = 0; i < data.length; i += MAX_BYTES_PER_CELL) {
    chunks.push(data.subarray(i, Math.min(i + MAX_BYTES_PER_CELL, data.length)))
  }
  return asSnakedCell(chunks, (chunk: Buffer) => beginCell().storeBuffer(chunk))
}

export function createExtraArgs(): Cell {
  return rt.GenericExtraArgsV2.toCell(
    rt.GenericExtraArgsV2.create({
      gasLimit: BigInt(MAX_EXTRA_ARGS_SIZE),
      allowOutOfOrderExecution: true,
    }),
  )
}
