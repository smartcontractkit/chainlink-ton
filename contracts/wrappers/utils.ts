import { Cell } from '@ton/core'
import { createHash } from 'crypto'

// Helper function to compute a 32-bit SHA-256 hash of a string (e.g., Tolk's stringSha256_32)
export const sha256_32 = (input: string): bigint => {
  const hash = createHash('sha256').update(input).digest()
  // Take the first 4 bytes as a 32-bit unsigned integer (big-endian)
  return BigInt(hash.readUInt32BE(0))
}

export interface CellCodec<T> {
  encode: (data: T) => Cell
  decode: (cell: Cell) => T
}
