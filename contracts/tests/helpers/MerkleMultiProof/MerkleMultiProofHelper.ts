import { uint8ArrayToBigInt, bigIntToBytes32 } from './Utils'
import { beginCell } from '@ton/core'

// Internal domain separator for Merkle internal nodes, represented as a 256-bit BigInt (0x01)
const INTERNAL_DOMAIN_SEPARATOR_BIGINT =
  0x0000000000000000000000000000000000000000000000000000000000000001n

// Leaf domain separator (0x00...00), represented as a 256-bit BigInt (0n)
const LEAF_DOMAIN_SEPARATOR_BIGINT =
  0x0000000000000000000000000000000000000000000000000000000000000000n

const MAX_NUM_HASHES = 256

class InvalidProof extends Error {}
class LeavesCannotBeEmpty extends Error {}

export type HashFunction = (data: Uint8Array) => Uint8Array

export class MerkleHelper {
  private hash: HashFunction

  constructor(hashFunction: HashFunction) {
    this.hash = hashFunction
  }

  public merkleMultiProof(
    leaves: bigint[],
    proofs: bigint[],
    proofFlagBits: bigint, // interpreted as 256-bit flags
  ): bigint {
    const leavesLen = leaves.length
    const proofsLen = proofs.length

    if (leavesLen === 0) throw new LeavesCannotBeEmpty()
    if (leavesLen > MAX_NUM_HASHES + 1 || proofsLen > MAX_NUM_HASHES + 1) throw new InvalidProof()

    const totalHashes = leavesLen + proofsLen - 1
    if (totalHashes > MAX_NUM_HASHES) throw new InvalidProof()
    if (totalHashes === 0) return leaves[0]

    const hashes: bigint[] = new Array(totalHashes)
    let leafPos = 0
    let hashPos = 0
    let proofPos = 0

    for (let i = 0; i < totalHashes; i++) {
      // Check if bit `i` is set in proofFlagBits
      const useLeafOrHash = (proofFlagBits & (1n << BigInt(i))) === 1n << BigInt(i)

      let a: bigint
      if (useLeafOrHash) {
        if (leafPos < leavesLen) {
          a = leaves[leafPos++]
        } else {
          a = hashes[hashPos++]
        }
      } else {
        a = proofs[proofPos++]
      }

      let b: bigint
      if (leafPos < leavesLen) {
        b = leaves[leafPos++]
      } else {
        b = hashes[hashPos++]
      }

      if (hashPos > i) throw new InvalidProof()

      hashes[i] = this.hashPair(a, b)
    }

    if (hashPos !== totalHashes - 1 || leafPos !== leavesLen || proofPos !== proofsLen) {
      throw new InvalidProof()
    }

    return hashes[totalHashes - 1]
  }

  /**
   * Hashes two 256-bit BigInts, ordering them by value before hashing (a < b ? hash(a,b) : hash(b,a)).
   * @param a The first 256-bit BigInt.
   * @param b The second 256-bit BigInt.
   * @returns The hashed pair as a 256-bit BigInt.
   */
  private hashPair(a: bigint, b: bigint): bigint {
    return a < b ? this.hashInternalNode(a, b) : this.hashInternalNode(b, a)
  }

  /**
   * Hashes an internal Merkle node, concatenating the 32-byte representations
   * of the domain separator, left child, and right child, then applying hash.
   * This mirrors Solidity's `hash(abi.encode(bytes32, bytes32, bytes32))`.
   * @param left The left child hash (256-bit BigInt).
   * @param right The right child hash (256-bit BigInt).
   * @returns The internal node hash as a 256-bit BigInt.
   */
  private hashInternalNode(left: bigint, right: bigint): bigint {
    var data = beginCell()
      .storeUint(INTERNAL_DOMAIN_SEPARATOR_BIGINT, 256)
      .storeUint(left, 256)
      .storeUint(right, 256)
      .endCell()

    return uint8ArrayToBigInt(data.hash())
  }

  /**
   * Generates a Merkle Root from a full set of pre-hashed leaves.
   * Assumes unbalanced trees are handled by carrying up the last element.
   * @param hashedLeaves An array of 256-bit BigInts representing hashed leaves.
   * @returns The Merkle Root as a 256-bit BigInt.
   */
  public getMerkleRoot(hashedLeaves: bigint[]): bigint {
    if (hashedLeaves.length > 256) {
      throw new Error('Leaves length must not exceed 256.')
    }
    let currentLayer = hashedLeaves
    while (currentLayer.length > 1) {
      currentLayer = this.computeNextLayer(currentLayer)
    }
    return currentLayer[0]
  }

  /**
   * Computes a single layer of the Merkle tree by hashing pairs.
   * The last element is carried up directly if the layer has an odd number of elements.
   * @param layer An array of 256-bit BigInts for the current layer.
   * @returns An array of 256-bit BigInts for the next layer.
   */
  private computeNextLayer(layer: bigint[]): bigint[] {
    const leavesLen = layer.length
    if (leavesLen === 1) return layer

    const nextLayer: bigint[] = []
    for (let i = 0; i < leavesLen; i += 2) {
      if (i === leavesLen - 1) {
        nextLayer.push(layer[i])
      } else {
        nextLayer.push(this.hashPair(layer[i], layer[i + 1]))
      }
    }
    return nextLayer
  }

  /**
   * Helper to hash initial raw data into a 256-bit leaf hash.
   * This prepends the LEAF_DOMAIN_SEPARATOR and applies hash.
   * @param data The raw data (string or Uint8Array) to hash for the leaf.
   * @returns The 256-bit BigInt leaf hash.
   */
  public hashLeafData(data: string | Uint8Array, hash: HashFunction): bigint {
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const separatorBytes = bigIntToBytes32(LEAF_DOMAIN_SEPARATOR_BIGINT) // 32 bytes

    // Concatenate the 32-byte separator with the leaf data bytes
    const combinedBytes = new Uint8Array(separatorBytes.length + dataBytes.length)
    combinedBytes.set(separatorBytes, 0)
    combinedBytes.set(dataBytes, separatorBytes.length)

    return uint8ArrayToBigInt(hash(combinedBytes))
  }
}
