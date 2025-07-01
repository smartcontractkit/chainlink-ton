import { Builder, beginCell, Cell } from '@ton/core'

// Converts a BigInt to a 32-byte (256-bit) Uint8Array, padding with leading zeros if necessary.
export function bigIntToBytes32(value: bigint): Uint8Array {
  // Convert BigInt to hexadecimal string, then pad to 64 characters (32 bytes)
  const hex = value.toString(16).padStart(64, '0')
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// Converts a 32 byte array to bigint
export function uint8ArrayToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}

export function listAsSnake(array: bigint[]): Cell {
  const cells: Builder[] = []
  let builder = beginCell()
  let countInCurrent = 0

  for (const value of array) {
    if (countInCurrent === 3) {
      cells.push(builder)
      builder = beginCell()
      countInCurrent = 0
    }
    builder.storeUint(value, 256)
    countInCurrent++
  }

  cells.push(builder)

  // Build the linked structure from the end
  let current = cells[cells.length - 1].endCell()
  for (let i = cells.length - 2; i >= 0; i--) {
    const b = cells[i]
    b.storeRef(current)
    current = b.endCell()
  }

  return current
}
