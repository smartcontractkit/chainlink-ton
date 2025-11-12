import { Builder, Slice, TupleItem } from '@ton/core'
import { createHash } from 'crypto'

/// Returns the facility ID for the given CRC16 key (e.g. stringCrc16("com.chainlink.ton.mcms.Timelock")).
/// Returns a value in range 10..649 (640 values).
export const facilityId = (crc32Key: number): number => {
  return (crc32Key % 640) + 10
}

/// Returns an error code composed from facility and local code (max 2^16-1).
export const errorCode = (crc32Key: number, local: number): number => {
  return facilityId(crc32Key) * 100 + local
}

// Helper function to compute a SHA-256 hash of a string (e.g., Tolk's stringSha256)
export const sha256 = (input: string): bigint => {
  const hash = createHash('sha256').update(input).digest()
  return BigInt('0x' + hash.toString('hex'))
}

// Helper function to compute a 32-bit SHA-256 hash of a string (e.g., Tolk's stringSha256_32)
export const sha256_32 = (input: string): bigint => {
  const hash = createHash('sha256').update(input).digest()
  // Take the first 4 bytes as a 32-bit unsigned integer (big-endian)
  return BigInt(hash.readUInt32BE(0))
}

export interface CellCodec<T> {
  encode: (data: T) => Builder
  load: (src: Slice) => T
}

export interface StackCodec<T> {
  encode: (data: T) => TupleItem[]
  load: (src: TupleItem[]) => T
}
