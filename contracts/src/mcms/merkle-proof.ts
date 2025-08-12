import { beginCell, Cell } from '@ton/core'
import { mcms } from '../../wrappers/mcms'

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

export const constructLeaves = (ops: mcms.Op[], rootMetadata: mcms.RootMetadata): bigint[] => {
  const leaves: bigint[] = new Array(ops.length + 1)

  // Encode rootMetadata as cell and hash
  const leafMetadata = leafMetadataPreimage(rootMetadata).hash()
  leaves[Number(ROOT_METADATA_LEAF_INDEX)] = BigInt('0x' + leafMetadata.toString('hex'))

  for (let i = 0; i < ops.length; i++) {
    // Encode op as cell and hash
    const leaf = leafOpPreimage(ops[i]).hash()
    const leafIndex = i >= Number(ROOT_METADATA_LEAF_INDEX) ? i + 1 : i
    leaves[leafIndex] = BigInt('0x' + leaf.toString('hex'))
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
