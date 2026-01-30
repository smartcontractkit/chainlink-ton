import { Cell, beginCell } from '@ton/core'
import * as rt from '../../../../wrappers/ccip/Router'
import { asSnakedCell } from '../../../../src/utils'

// Messaging-specific test parameters
export const MAX_DATA_PAYLOAD_SIZE = 1232 // bytes (using Solana CCIP max size as reference for a reasonable limit)
export const MAX_EXTRA_ARGS_SIZE = 500 // bytes
export const MESSAGE_COUNT_IN_COMMIT = 10 // messages per commit report

export function createMaxPayload(): Cell {
  // Create maximum size payload using snake data encoding
  const size = MAX_DATA_PAYLOAD_SIZE
  return createPayload(size)
}

export function createPayload(size: number): Cell {
  // Create a payload of specified size using snake data encoding
  // Snake data automatically chains cells when data doesn't fit in one cell
  const data = Buffer.alloc(size, 0xff)
  const chunks: Buffer[] = []

  // TON cells can store max 1023 bits (127 bytes + 7 bits)
  // Use 127 bytes per chunk - asSnakeData will handle overflow automatically
  const MAX_BYTES_PER_CELL = 127
  for (let i = 0; i < data.length; i += MAX_BYTES_PER_CELL) {
    chunks.push(data.subarray(i, Math.min(i + MAX_BYTES_PER_CELL, data.length)))
  }

  return asSnakedCell(chunks, (chunk: Buffer) => beginCell().storeBuffer(chunk))
}

export function createExtraArgs(): Cell {
  // Create properly encoded extraArgs for gas testing
  return rt.builder.data.extraArgs
    .encode({
      kind: 'generic-v2',
      gasLimit: BigInt(MAX_EXTRA_ARGS_SIZE), // Use MAX_EXTRA_ARGS_SIZE as gas limit for worst-case
      allowOutOfOrderExecution: true,
    })
    .asCell()
}
