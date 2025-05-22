// Internal domain separator for Merkle internal nodes, represented as a 256-bit BigInt (0x01)
const INTERNAL_DOMAIN_SEPARATOR_BIGINT = 1n;

// Leaf domain separator (0x00...00), represented as a 256-bit BigInt (0n)
const LEAF_DOMAIN_SEPARATOR_BIGINT = 0n;

// Converts a BigInt to a 32-byte (256-bit) Uint8Array, padding with leading zeros if necessary.
export function bigIntToBytes32(value: bigint): Uint8Array {
  // Convert BigInt to hexadecimal string, then pad to 64 characters (32 bytes)
  const hex = value.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Converts a 32 byte array to bigint
export function uint8ArrayToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

export type HashFunction = (data: Uint8Array) => Uint8Array;

export class MerkleHelper {
    private hash: HashFunction;

    constructor(hashFunction: HashFunction) {
        this.hash = hashFunction;
    }

  /**
   * Generates a Merkle Root from a full set of pre-hashed leaves.
   * Assumes unbalanced trees are handled by carrying up the last element.
   * @param hashedLeaves An array of 256-bit BigInts representing hashed leaves.
   * @returns The Merkle Root as a 256-bit BigInt.
   */
  public getMerkleRoot(hashedLeaves: bigint[]): bigint {
    if (hashedLeaves.length > 256) {
      throw new Error("Leaves length must not exceed 256.");
    }
    let currentLayer = hashedLeaves.map(leaf => bigIntToBytes32(leaf));
    while (currentLayer.length > 1) {
      currentLayer = this.computeNextLayer(currentLayer);
    }
    return uint8ArrayToBigInt(currentLayer[0]);
  }

  /**
   * Computes a single layer of the Merkle tree by hashing pairs.
   * The last element is carried up directly if the layer has an odd number of elements.
   * @param layer An array of 256-bit BigInts for the current layer.
   * @returns An array of 256-bit BigInts for the next layer.
   */
  private computeNextLayer(layer: Uint8Array[]): Uint8Array[] {
    const leavesLen = layer.length;
    if (leavesLen === 1) return layer;

    const nextLayer: Uint8Array[] = [];
    for (let i = 0; i < leavesLen; i += 2) {
      if (i === leavesLen - 1) {
        nextLayer.push(layer[i]);
      } else {
        nextLayer.push(this.hashPair(layer[i], layer[i + 1]));
      }
    }
    return nextLayer;
  }

  /**
   * Hashes two 256-bit BigInts, ordering them by value before hashing (a < b ? hash(a,b) : hash(b,a)).
   * @param a The first 256-bit BigInt.
   * @param b The second 256-bit BigInt.
   * @returns The hashed pair as a 256-bit BigInt.
   */
  private hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
    return a < b ? this.hashInternalNode(a, b) : this.hashInternalNode(b, a);
  }

  /**
   * Hashes an internal Merkle node, concatenating the 32-byte representations
   * of the domain separator, left child, and right child, then applying hash.
   * This mirrors Solidity's `hash(abi.encode(bytes32, bytes32, bytes32))`.
   * @param left The left child hash (256-bit BigInt).
   * @param right The right child hash (256-bit BigInt).
   * @returns The internal node hash as a 256-bit BigInt.
   */
  private hashInternalNode(left: Uint8Array, right: Uint8Array): Uint8Array {
    // Each component (separator, left, right) is converted to its 32-byte representation.
    const separatorBytes = bigIntToBytes32(INTERNAL_DOMAIN_SEPARATOR_BIGINT); // 32 bytes

    // Concatenate the three 32-byte arrays into a single 96-byte array.
    const combinedBytes = new Uint8Array(96); // 3 * 32 bytes total
    combinedBytes.set(separatorBytes, 0);   // Place separator at the beginning
    combinedBytes.set(left, 32);       // Place left child after separator
    combinedBytes.set(right, 64);      // Place right child after left child

    // Apply hash to the combined 96-byte array.
    return this.hash(combinedBytes);
  }


    /**
     * Helper to hash initial raw data into a 256-bit leaf hash.
     * This prepends the LEAF_DOMAIN_SEPARATOR and applies hash.
     * @param data The raw data (string or Uint8Array) to hash for the leaf.
     * @returns The 256-bit BigInt leaf hash.
     */
    public hashLeafData(data: string | Uint8Array, hash: HashFunction): bigint {
      const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const separatorBytes = bigIntToBytes32(LEAF_DOMAIN_SEPARATOR_BIGINT); // 32 bytes

      // Concatenate the 32-byte separator with the leaf data bytes
      const combinedBytes = new Uint8Array(separatorBytes.length + dataBytes.length);
      combinedBytes.set(separatorBytes, 0);
      combinedBytes.set(dataBytes, separatorBytes.length);

      return uint8ArrayToBigInt(hash(combinedBytes));
    }
}

