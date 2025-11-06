import { Tuple, beginCell, Builder, Cell, Slice, TupleItem, TupleReader, Address } from '@ton/core'
import { mnemonicNew, mnemonicToPrivateKey, sha256_sync } from '@ton/crypto'
import crypto from 'crypto'

export const ZERO_ADDRESS: Address = Address.parse(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

export function bigIntToBuffer(value: bigint): Buffer {
  let hex = value.toString(16)
  if (hex.length % 2) hex = '0' + hex // ensure even length
  return Buffer.from(hex, 'hex')
}

// Converts a BigInt to a Uint8Array.
export function bigIntToUint8Array(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError('Only non-negative BigInt values are supported')
  if (value === 0n) return new Uint8Array([0])

  let hex = value.toString(16) // no "0x"
  if (hex.length % 2) hex = '0' + hex // ensure full bytes

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) // big-endian
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

export function asSnakeBytes(data: Buffer): Cell {
  return asSnakeData(Array.from(data), (item: number) => new Builder().storeUint(item, 8))
}

export function asSnakeDataUint(data: bigint[] | number[], bits: number): Cell {
  return asSnakeData(data, (item: bigint | number) => new Builder().storeUint(item, bits))
}

export function isEmpty(slice: Slice): boolean {
  const remainingBits = slice.remainingBits
  const remainingRefs = slice.remainingRefs
  if (remainingBits > 0 || remainingRefs > 0) {
    return false
  }
  return true
}

export function hashSync(data: string): bigint {
  return uint8ArrayToBigInt(sha256_sync(data))
}

function tonEquals(a, b) {
  if (a instanceof Address) {
    if (!(b instanceof Address)) return false
    return a.equals(b)
  }

  if (a instanceof Cell) {
    if (!(b instanceof Cell)) return false
    return a.equals(b)
  }

  return undefined
}

export async function generateRandomTonAddress() {
  const mnemonics = await mnemonicNew()
  const keyPair = await mnemonicToPrivateKey(mnemonics)
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey })
  const address = wallet.address
  return address
}

export function generateMockTonAddress(): Address {
  const workchain = 0 // Commonly used workchain ID
  const hashPart = crypto.randomBytes(32).toString('hex') // 32-byte hash in hex
  const rawAddress = `${workchain}:${hashPart}`
  return Address.parse(rawAddress)
}

export async function generateRandomAddresses(count: number) {
  const addresses: Address[] = []
  for (let i = 0; i < count; i++) {
    addresses.push(await generateRandomTonAddress())
  }
  return addresses
}

export function generateRandomMockAddresses(count: number) {
  const addresses: Address[] = []
  for (let i = 0; i < count; i++) {
    addresses.push(generateMockTonAddress())
  }
  return addresses
}

export async function generateEd25519KeyPair() {
  const mnemonics = await mnemonicNew()
  return await mnemonicToPrivateKey(mnemonics)
}

function generateMockPublicKey(): Buffer {
  return crypto.randomBytes(32) // 32 bytes = 256 bits
}

export function generateRandomMockSigners(count: number) {
  const signers: bigint[] = []
  for (let i = 0; i < count; i++) {
    signers.push(uint8ArrayToBigInt(generateMockPublicKey()))
  }
  return signers
}

// Extend expect to support Address and Cell equality
import { expect } from '@jest/globals'
import { WalletContractV4 } from '@ton/ton'
expect.addEqualityTesters([tonEquals])
