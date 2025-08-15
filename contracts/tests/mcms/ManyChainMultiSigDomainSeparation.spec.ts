import { beginCell, Cell } from '@ton/core'
import '@ton/test-utils'
import { MCMSBaseSetRootAndExecuteTestSetup, MCMSTestCode } from './ManyChainMultiSigBaseTest'
import { merkleProof } from '../../src/mcms'
import * as mcms from '../../wrappers/mcms/MCMS'

describe('MCMS - ManyChainMultiSigDomainSeparationTest', () => {
  let baseTest: MCMSBaseSetRootAndExecuteTestSetup
  let code: MCMSTestCode

  beforeAll(async () => {
    code = await MCMSBaseSetRootAndExecuteTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new MCMSBaseSetRootAndExecuteTestSetup()
    baseTest.code = code
    await baseTest.setupForSetRootAndExecute('test-domain-separation')
  })

  it('should verify merkle tree preimage domain separation', () => {
    // We store three kinds of items in the Merkle tree:
    // - inner nodes which are of size 64 bytes (32 bytes + 32 bytes)
    //   (see openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15)
    // - RootMetadata
    // - Op
    // RootMetadata and Op are both hashed with a domain separator,
    // so we here we just need to ensure that both their pre-images have
    // a length different from that of inner nodes (64 bytes)

    // Test with empty RootMetadata
    const emptyRootMetadata: mcms.RootMetadata = {
      chainId: 0n,
      multiSig: baseTest.bind.mcms.address,
      preOpCount: 0n,
      postOpCount: 0n,
      overridePreviousRoot: false,
    }

    const rootMetadataPreimageCell = merkleProof.leafMetadataPreimage(emptyRootMetadata)
    const rootMetadataPreimage = rootMetadataPreimageCell.toBoc()

    // The preimage should be longer than 64 bytes (inner nodes)
    // This ensures no collision between metadata leaves and inner nodes
    expect(rootMetadataPreimage.length).toBeGreaterThan(64)

    // Test with empty Op
    const emptyOp: mcms.Op = {
      chainId: 0n,
      multiSig: baseTest.bind.mcms.address,
      nonce: 0n,
      to: baseTest.bind.mcms.address,
      value: 0n,
      data: beginCell().endCell(),
    }

    const opPreimageCell = merkleProof.leafOpPreimage(emptyOp)
    const opPreimage = opPreimageCell.toBoc()

    // The preimage should be longer than 64 bytes (inner nodes)
    // This ensures no collision between op leaves and inner nodes
    expect(opPreimage.length).toBeGreaterThan(64)

    // Test with actual test data to ensure they also satisfy the constraints
    const actualRootMetadata = baseTest.initialTestRootMetadata
    const actualRootMetadataPreimageCell = merkleProof.leafMetadataPreimage(actualRootMetadata)
    const actualRootMetadataPreimage = actualRootMetadataPreimageCell.toBoc()
    expect(actualRootMetadataPreimage.length).toBeGreaterThan(64)

    const actualOp = baseTest.testOps[0]
    const actualOpPreimageCell = merkleProof.leafOpPreimage(actualOp)
    const actualOpPreimage = actualOpPreimageCell.toBoc()
    expect(actualOpPreimage.length).toBeGreaterThan(64)

    // Verify that the domain separators are properly included
    // The metadata preimage should start with the metadata domain separator
    const metadataBytes = rootMetadataPreimageCell.beginParse()
    const separatorFromPreimage = metadataBytes.loadUint(256)
    expect(separatorFromPreimage).toEqual(
      Number(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA),
    )

    // The op preimage should start with the op domain separator
    const opBytes = opPreimageCell.beginParse()
    const opSeparatorFromPreimage = opBytes.loadUint(256)
    expect(opSeparatorFromPreimage).toEqual(Number(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP))

    // Verify that the two domain separators are different
    expect(mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA).not.toEqual(
      mcms.MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP,
    )
  })
})
