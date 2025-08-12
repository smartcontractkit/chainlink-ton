import { beginCell, Cell } from '@ton/core'
import { mcms } from '../../wrappers/mcms'
import { uint8ArrayToBigInt } from '../utils'

export const ROOT_METADATA_LEAF_INDEX = 0n

export const build = (
  privateKeys: bigint[], // TODO: signers
  validUntil: bigint,
  metadata: mcms.RootMetadata,
  ops: mcms.Op[],
) => {
  const leaves = constructLeaves(ops, metadata)

  // TODO: use MerkleHelper to build the proof
}

export const computeProofForLeaf = (data: bigint[], index: number): bigint[] => {
  // this method assumes that there is an even number of leaves.
  if (data.length % 2 !== 0) {
    throw new Error('Invalid proof request: data length must be even')
  }

  const proof: bigint[] = new Array(proofLen(data.length))

  while (data.length > 1) {
    if ((index & 0x1) === 1) {
      proof.push(data[index - 1])
    } else {
      proof.push(data[index + 1])
    }
    index = Math.floor(index / 2)
    data = hashLevel(data)
  }
  return proof
}

export const hashLevel = (data: bigint[]): bigint[] => {
  const newData: bigint[] = []
  for (let i = 0; i < data.length - 1; i += 2) {
    newData.push(hashPair(data[i], data[i + 1]))
  }
  return newData
}

// TODO: figure out how to combine/reuse with MerkleMultiProofHelper (some duplicate code here)

/**
 * Hashes two 256-bit BigInts, ordering them by value before hashing (a < b ? hash(a,b) : hash(b,a)).
 * @param a The first 256-bit BigInt.
 * @param b The second 256-bit BigInt.
 * @returns The hashed pair as a 256-bit BigInt.
 */
export const hashPair = (a: bigint, b: bigint): bigint => {
  return a < b ? hashInternalNode(a, b) : hashInternalNode(b, a)
}

/**
 * Hashes an internal Merkle node, concatenating the 32-byte left child,
 * and right child, then applying hash.
 * This mirrors Solidity's `hash(abi.encode(bytes32, bytes32))`.
 * @param left The left child hash (256-bit BigInt).
 * @param right The right child hash (256-bit BigInt).
 * @returns The internal node hash as a 256-bit BigInt.
 */
export const hashInternalNode = (left: bigint, right: bigint): bigint => {
  const data = beginCell().storeUint(left, 256).storeUint(right, 256).endCell()
  return uint8ArrayToBigInt(data.hash())
}

export const constructLeaves = (ops: mcms.Op[], rootMetadata: mcms.RootMetadata): bigint[] => {
  const leaves: bigint[] = new Array(ops.length + 1)

  // Encode rootMetadata as cell and hash
  const leafMetadata = leafMetadataPreimage(rootMetadata).hash()
  leaves[Number(ROOT_METADATA_LEAF_INDEX)] = uint8ArrayToBigInt(leafMetadata)

  for (let i = 0; i < ops.length; i++) {
    // Encode op as cell and hash
    const leaf = leafOpPreimage(ops[i]).hash()
    const leafIndex = i >= Number(ROOT_METADATA_LEAF_INDEX) ? i + 1 : i
    leaves[leafIndex] = uint8ArrayToBigInt(leaf)
  }

  return leaves
}

export const leafMetadataPreimage = (rootMetadata: mcms.RootMetadata): Cell => {
  return beginCell()
    .storeUint(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, 256)
    .storeBuilder(mcms.builder.data.rootMetadata.encode(rootMetadata).asBuilder())
    .endCell()
}

export const leafOpPreimage = (op: mcms.Op): Cell => {
  return beginCell()
    .storeUint(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP, 256)
    .storeBuilder(mcms.builder.data.op.encode(op).asBuilder())
    .endCell()
}

export const proofLen = (opsLen: number): number => {
  return Math.ceil(Math.log2(opsLen + 1))
}
