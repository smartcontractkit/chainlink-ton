import { uint8ArrayToBigInt, bigIntToUint8Array } from '../../../../src/utils'
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

export interface Proof {
  hashes: bigint[]
  sourceFlags: boolean[]
}

interface SingleLayerProof {
  nextIndices: number[]
  subProof: bigint[]
  sourceFlags: boolean[]
}

export class MerkleTree {
  private hash: HashFunction
  private layers: bigint[][] = []

  constructor(hashFunction: HashFunction, leafHashes: bigint[]) {
    if (leafHashes.length === 0) {
      throw new LeavesCannotBeEmpty()
    }

    this.hash = hashFunction
    this.buildTree(leafHashes)
  }

  /**
   * Builds the tree using the same logic as the legacy getMerkleRoot method
   * to ensure backward compatibility
   */
  private buildTree(leafHashes: bigint[]): void {
    let layer = [...leafHashes]
    this.layers = [layer]

    while (layer.length > 1) {
      layer = this.computeNextLayer(layer)
      this.layers.push(layer)
    }
  }

  /**
   * Computes a single layer of the Merkle tree by hashing pairs.
   * Uses the same logic as the legacy implementation for compatibility.
   */
  private computeNextLayer(layer: bigint[]): bigint[] {
    const leavesLen = layer.length
    if (leavesLen === 1) return layer

    const nextLayer: bigint[] = []
    for (let i = 0; i < leavesLen; i += 2) {
      if (i === leavesLen - 1) {
        // If odd number of elements, the last one is promoted to the next layer
        nextLayer.push(layer[i])
      } else {
        nextLayer.push(this.hashPair(layer[i], layer[i + 1]))
      }
    }
    return nextLayer
  }

  public getRoot(): bigint {
    return this.layers[this.layers.length - 1][0]
  }

  /**
   * Get all layers of the tree (for debugging/inspection)
   */
  public getLayers(): bigint[][] {
    return this.layers.map((layer) => [...layer])
  }

  /**
   * Hashes two 256-bit BigInts, ordering them by value before hashing.
   */
  private hashPair(a: bigint, b: bigint): bigint {
    return a < b ? this.hashInternalNode(a, b) : this.hashInternalNode(b, a)
  }

  public prove(indices: number[]): Proof {
    if (indices.length === 0) {
      throw new Error('Cannot prove empty indices')
    }

    // Sort and deduplicate indices
    const sortedIndices = [...new Set(indices)].sort((a, b) => a - b)

    // Validate indices
    const maxIndex = this.layers[0].length - 1
    for (const idx of sortedIndices) {
      if (idx < 0 || idx > maxIndex) {
        throw new Error(`Index ${idx} is out of bounds [0, ${maxIndex}]`)
      }
    }

    const proof: Proof = {
      hashes: [],
      sourceFlags: [],
    }

    let currentIndices = [...sortedIndices]

    // Iterate through all layers except the root
    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex]
      const singleLayerProof = this.proveSingleLayer(layer, currentIndices)

      currentIndices = singleLayerProof.nextIndices
      proof.hashes.push(...singleLayerProof.subProof)
      proof.sourceFlags.push(...singleLayerProof.sourceFlags)
    }

    return proof
  }

  private proveSingleLayer(layer: bigint[], indices: number[]): SingleLayerProof {
    const authIndices: number[] = []
    const nextIndices: number[] = []
    const sourceFlags: boolean[] = []

    let j = 0
    while (j < indices.length) {
      const x = indices[j]
      const parent = this.parentIndex(x)

      // Only add parent if it's not already in nextIndices
      if (nextIndices.length === 0 || nextIndices[nextIndices.length - 1] !== parent) {
        nextIndices.push(parent)
      }

      const sibling = this.siblingIndex(x)

      if (j + 1 < indices.length && indices[j + 1] === sibling) {
        // Both siblings are being proven, so we can use the provided hashes
        j++ // Skip the sibling
        sourceFlags.push(true) // SourceFromHashes
      } else {
        // Need the sibling from the proof
        // Only add if sibling is within bounds
        if (sibling < layer.length) {
          authIndices.push(sibling)
          sourceFlags.push(false) // SourceFromProof
        }
      }
      j++
    }

    const subProof: bigint[] = []
    for (const authIndex of authIndices) {
      if (authIndex < 0 || authIndex >= layer.length) {
        throw new Error(`Auth index ${authIndex} is out of bounds`)
      }
      subProof.push(layer[authIndex])
    }

    return {
      nextIndices,
      subProof,
      sourceFlags,
    }
  }

  private parentIndex(idx: number): number {
    return Math.floor(idx / 2)
  }

  private siblingIndex(idx: number): number {
    return idx ^ 1
  }

  /**
   * Hashes an internal Merkle node, concatenating the 32-byte representations
   * of the domain separator, left child, and right child, then applying hash.
   */
  private hashInternalNode(left: bigint, right: bigint): bigint {
    const data = beginCell()
      .storeUint(INTERNAL_DOMAIN_SEPARATOR_BIGINT, 256)
      .storeUint(left, 256)
      .storeUint(right, 256)
      .endCell()

    return uint8ArrayToBigInt(data.hash())
  }
}

export class MerkleHelper {
  private hash: HashFunction

  constructor(hashFunction: HashFunction) {
    this.hash = hashFunction
  }

  /**
   * Creates a new Merkle tree from leaf hashes
   */
  public createTree(leafHashes: bigint[]): MerkleTree {
    return new MerkleTree(this.hash, leafHashes)
  }

  /**
   * Convenience method to create a tree and generate a proof for specific indices
   */
  public createTreeAndProve(
    leafHashes: bigint[],
    indices: number[],
  ): { tree: MerkleTree; proof: Proof; root: bigint } {
    const tree = this.createTree(leafHashes)
    const proof = tree.prove(indices)
    const root = tree.getRoot()
    return { tree, proof, root }
  }

  /**
   * Convenience method to hash leaf data and create a tree
   */
  public createTreeFromData(leafData: (string | Uint8Array)[]): MerkleTree {
    const hashedLeaves = leafData.map((data) => this.hashLeafData(data))
    return this.createTree(hashedLeaves)
  }

  /**
   * Validates a merkle multi proof using the new sourceFlags format
   */
  public verifyMultiProof(leaves: bigint[], proof: Proof): bigint {
    const leavesLen = leaves.length
    const proofsLen = proof.hashes.length

    if (leavesLen === 0) throw new LeavesCannotBeEmpty()
    if (leavesLen > MAX_NUM_HASHES + 1 || proofsLen > MAX_NUM_HASHES + 1) throw new InvalidProof()

    const totalHashes = leavesLen + proofsLen - 1
    if (totalHashes > MAX_NUM_HASHES) throw new InvalidProof()
    if (totalHashes === 0) return leaves[0]

    if (totalHashes !== proof.sourceFlags.length) {
      throw new InvalidProof(`Hashes ${totalHashes} != sourceFlags ${proof.sourceFlags.length}`)
    }

    const sourceProofCount = proof.sourceFlags.filter((flag) => !flag).length
    if (sourceProofCount !== proofsLen) {
      throw new InvalidProof(`Proof source flags ${sourceProofCount} != proof hashes ${proofsLen}`)
    }

    const hashes: bigint[] = new Array(totalHashes)
    let leafPos = 0
    let hashPos = 0
    let proofPos = 0

    for (let i = 0; i < totalHashes; i++) {
      let a: bigint
      if (proof.sourceFlags[i]) {
        // SourceFromHashes
        if (leafPos < leavesLen) {
          a = leaves[leafPos++]
        } else {
          a = hashes[hashPos++]
        }
      } else {
        // SourceFromProof
        a = proof.hashes[proofPos++]
      }

      let b: bigint
      if (leafPos < leavesLen) {
        b = leaves[leafPos++]
      } else {
        b = hashes[hashPos++]
      }

      hashes[i] = this.hashPair(a, b)
    }

    if (hashPos !== totalHashes - 1 || leafPos !== leavesLen || proofPos !== proofsLen) {
      throw new InvalidProof('Not all proofs used during processing')
    }

    return hashes[totalHashes - 1]
  }

  // Legacy method for backward compatibility
  public merkleMultiProof(leaves: bigint[], proofs: bigint[], proofFlagBits: bigint): bigint {
    // Convert bit flags to boolean array
    const totalHashes = leaves.length + proofs.length - 1
    const sourceFlags: boolean[] = []

    for (let i = 0; i < totalHashes; i++) {
      const useLeafOrHash = (proofFlagBits & (1n << BigInt(i))) === 1n << BigInt(i)
      sourceFlags.push(useLeafOrHash)
    }

    return this.verifyMultiProof(leaves, {
      hashes: proofs,
      sourceFlags,
    })
  }

  /**
   * Hashes an internal Merkle node
   */
  private hashInternalNode(left: bigint, right: bigint): bigint {
    const data = beginCell()
      .storeUint(INTERNAL_DOMAIN_SEPARATOR_BIGINT, 256)
      .storeUint(left, 256)
      .storeUint(right, 256)
      .endCell()

    return uint8ArrayToBigInt(data.hash())
  }

  /**
   * Generates a Merkle Root from a full set of pre-hashed leaves.
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
   * Hashes two 256-bit BigInts, ordering them by value before hashing.
   */
  private hashPair(a: bigint, b: bigint): bigint {
    return a < b ? this.hashInternalNode(a, b) : this.hashInternalNode(b, a)
  }

  /**
   * Helper to hash initial raw data into a 256-bit leaf hash.
   */
  public hashLeafData(data: string | Uint8Array): bigint {
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const separatorBytes = bigIntToUint8Array(LEAF_DOMAIN_SEPARATOR_BIGINT)

    const combinedBytes = new Uint8Array(separatorBytes.length + dataBytes.length)
    combinedBytes.set(separatorBytes, 0)
    combinedBytes.set(dataBytes, separatorBytes.length)

    return uint8ArrayToBigInt(this.hash(combinedBytes))
  }
}
