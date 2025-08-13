import { beginCell, Cell } from '@ton/core'
import { asSnakeData, uint8ArrayToBigInt } from '../utils'

import { ocr } from '../../wrappers/libraries/ocr'
import { mcms } from '../../wrappers/mcms'

export const ROOT_METADATA_LEAF_INDEX = 0

export type OpProofs = bigint[][]

export function build(
  signers: ocr.Signer[],
  validUntil: bigint,
  metadata: mcms.RootMetadata,
  ops: mcms.Op[],
): [mcms.SetRoot, OpProofs] {
  const leaves = constructLeaves(ops, metadata)

  const { root, metadataProof, signatures } = constructAnsSignRootAndProof(
    leaves,
    validUntil,
    signers,
  )

  // Compute proofs for each op
  const computeProof = (i: number): bigint[] => computeProofForLeaf(leaves, getLeafIndexOfOp(i))
  const opProofs: OpProofs = Array.from({ length: ops.length }, (_, i) => computeProof(i))

  const encodeProof = (v) => beginCell().storeUint(v, 256)
  const encodeSignature = (v) => mcms.builder.data.signature.encode(v).asBuilder()

  return [
    {
      queryId: 0n,
      root,
      validUntil,
      metadata,
      metadataProof: asSnakeData<bigint>(metadataProof, encodeProof),
      signatures: asSnakeData<mcms.Signature>(signatures, encodeSignature),
    },
    opProofs,
  ]
}

export function computeProofForLeaf(data: bigint[], index: number): bigint[] {
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

// Hashes two 256-bit BigInts, ordering them by value before hashing.
export function hashPair(a: bigint, b: bigint): bigint {
  return a < b ? hashInternalNode(a, b) : hashInternalNode(b, a)
}

// Hashes an internal Merkle node by concatenating two 256-bit BigInts and hashing.
export function hashInternalNode(left: bigint, right: bigint): bigint {
  const data = beginCell().storeUint(left, 256).storeUint(right, 256).endCell()
  return uint8ArrayToBigInt(data.hash())
}

export function constructLeaves(ops: mcms.Op[], rootMetadata: mcms.RootMetadata): bigint[] {
  const leaves: bigint[] = new Array(ops.length + 1)

  // Encode rootMetadata as cell and hash
  const leafMetadata = leafMetadataPreimage(rootMetadata).hash()
  leaves[ROOT_METADATA_LEAF_INDEX] = uint8ArrayToBigInt(leafMetadata)

  for (let i = 0; i < ops.length; i++) {
    const leaf = leafOpPreimage(ops[i]).hash()
    const leafIndex = i >= ROOT_METADATA_LEAF_INDEX ? i + 1 : i
    leaves[leafIndex] = uint8ArrayToBigInt(leaf)
  }

  return leaves
}

export function leafMetadataPreimage(rootMetadata: mcms.RootMetadata): Cell {
  return beginCell()
    .storeUint(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, 256)
    .storeBuilder(mcms.builder.data.rootMetadata.encode(rootMetadata).asBuilder())
    .endCell()
}

export function leafOpPreimage(op: mcms.Op): Cell {
  return beginCell()
    .storeUint(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP, 256)
    .storeRef(mcms.builder.data.op.encode(op)) // Doesn't fit in root cell
    .endCell()
}

export function proofLen(opsLen: number): number {
  return Math.ceil(Math.log2(opsLen + 1))
}

export function getLeafIndexOfOp(opIndex: number): number {
  return opIndex < ROOT_METADATA_LEAF_INDEX ? opIndex : opIndex + 1
}

export function constructAnsSignRootAndProof(
  leaves: bigint[],
  validUntil: bigint,
  signers: ocr.Signer[],
): {
  root: bigint
  metadataProof: bigint[]
  signatures: mcms.Signature[]
} {
  const root = computeRoot(leaves)
  const metadataProof = computeProofForLeaf(leaves, ROOT_METADATA_LEAF_INDEX)
  const signatures = fillSignatures(root, validUntil, signers)
  return { root, metadataProof, signatures }
}

// Placeholder for computeRoot and fillSignatures
export function computeRoot(leaves: bigint[]): bigint {
  // Implement Merkle root computation
  throw new Error('Not implemented')
}

function fillSignatures(root: bigint, validUntil: bigint, signers: ocr.Signer[]): mcms.Signature[] {
  const signatures: mcms.Signature[] = []
  const data = beginCell().storeUint(root, 256).storeUint(validUntil, 64).endCell().hash()

  for (const signer of signers) {
    const signature = ocr.createSignatureWith(signer, data)
    // TODO: validate signature
    signatures.push(signature)
  }

  return signatures
}
