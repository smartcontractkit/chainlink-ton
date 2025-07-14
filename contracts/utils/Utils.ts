import { Tuple, beginCell, Builder, Cell, Slice, TupleItem, TupleReader, Address } from '@ton/core'


export const ZERO_ADDRESS: Address = Address.parse(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

// Converts a BigInt to a 32-byte (256-bit) Uint8Array, padding with leading zeros if necessary.
export function bigIntToUint8Array(value: bigint): Uint8Array {
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


export function asSnakeData<T>(array: T[], builderFn: (item: T) => Builder): Cell {
  const cells: Builder[] = []
  let builder = beginCell()

  for (const value of array) {
    let itemBuilder = builderFn(value)
    if (itemBuilder.refs > 3) {
      throw 'Cannot pack more than 3 refs per item, use storeRef to a cell containing the item'
    }
    if (builder.availableBits < itemBuilder.bits || builder.availableRefs <= 1) {
      cells.push(builder)
      builder = beginCell()
    }
    builder.storeBuilder(itemBuilder)
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

export function fromSnakeData<T>(data: Cell, readerFn: (cs: Slice) => T): T[] {
  const array: T[] = []
  let cs = data.beginParse()
  while (!isEmpty(cs)) {
    if (cs.remainingBits > 0) {
      const item = readerFn(cs)
      array.push(item)
    } else {
      cs = cs.loadRef().beginParse()
    }
  }
  return array
}

export function isEmpty(slice: Slice): boolean {
  const remainingBits = slice.remainingBits
  const remainingRefs = slice.remainingRefs
  if (remainingBits > 0 || remainingRefs > 0) {
    return false
  }
  return true
}






