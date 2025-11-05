import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Cell } from '@ton/core'
import {
  MerkleMultiProofCalculator,
  MerkleMultiProofCalculatorStorage,
} from '../../../wrappers/libraries/merkle_proof/MerkleMultiProofCalculator'
import { sha256_sync } from '@ton/crypto'

import '@ton/test-utils'
import { MerkleHelper, HashFunction } from './helpers/MerkleMultiProofHelper'
import { compile } from '@ton/blueprint'
import { asSnakeDataUint } from '../../../src/utils'
import { TestVector, testVectors } from './TestVectors'
import { keccak256 } from '@ethersproject/keccak256'

describe('MerkleMultiProofTests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let calculator: SandboxContract<MerkleMultiProofCalculator>
  let merkleHelper: MerkleHelper
  let hashFunctionSha: HashFunction

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    let code = await compile('examples.MerkleProof')
    let data: MerkleMultiProofCalculatorStorage = {
      id: 1,
      root: 0n, // Initial root, will be updated on deploy
    }
    calculator = blockchain.openContract(MerkleMultiProofCalculator.createFromConfig(data, code))

    deployer = await blockchain.treasury('deployer')

    hashFunctionSha = (s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    }

    // Modify this initializaiton to generate test instances with Sha256 or Keccak256
    merkleHelper = new MerkleHelper()

    const deployResult = await calculator.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      deploy: true,
      success: true,
    })
  })

  it('Initial deploy should return root 0', async () => {
    expect(await calculator.getRoot()).toBe(0n)
  })

  it('Single leaf should be returned as root', async () => {
    let leaves = asSnakeDataUint([1337n], 256)
    let result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('0.5'),
      leaves,
      Cell.EMPTY,
      0n,
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })
    expect(await calculator.getRoot()).toBe(1337n)
  })

  it('Test Vectors', async () => {
    for (const vector of testVectors) {
      const leafHashes = vector.proofLeaves.map((hex) => {
        return BigInt('0x' + hex)
      })
      const proofHashes = vector.proofHashes.map((hex) => {
        return BigInt('0x' + hex)
      })
      let result = await calculator.sendMerkleRoot(
        deployer.getSender(),
        toNano('0.5'),
        asSnakeDataUint(leafHashes, 256),
        asSnakeDataUint(proofHashes, 256),
        merkleHelper.packBools(vector.proofFlags),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: calculator.address,
        success: true,
      })
      expect((await calculator.getRoot()).toString(16)).toBe(vector.expectedRoot)
    }
  })

  it('bench merkleRoot 128 leaves', async () => {
    const leaves: string[] = []
    for (let i = 0; i < 128; i++) {
      leaves.push('a')
    }
    const hashedLeaves: bigint[] = leaves.map((e) => BigInt(keccak256(Buffer.from(e))))

    const flagsUint128: bigint = 0xffffffffffffffffffffffffffffffffn

    const expectedRoot = merkleHelper.createTree(hashedLeaves).getRoot()

    deployer = await blockchain.treasury('deployer')
    const result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('100000'),
      asSnakeDataUint(hashedLeaves, 256),
      Cell.EMPTY,
      flagsUint128,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })

    expect(await calculator.getRoot()).toBe(expectedRoot)
  })

  it('bench merkleRoot 256 leaves', async () => {
    const leaves: string[] = []
    for (let i = 0; i < 256; i++) {
      leaves.push('a')
    }
    const hashedLeaves: bigint[] = leaves.map((e) => BigInt(keccak256(Buffer.from(e))))

    const flagsUint256: bigint = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn

    const expectedRoot = merkleHelper.createTree(hashedLeaves).getRoot()

    deployer = await blockchain.treasury('deployer')
    const result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('100000'),
      asSnakeDataUint(hashedLeaves, 256),
      Cell.EMPTY,
      flagsUint256,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })

    expect(await calculator.getRoot()).toBe(expectedRoot)
  })

  it('test tree with two leaves', async () => {
    let leaves = [
      0x67ac797670796606fd0b57bf1898120c1652696dca3f06bff9fccb9f808539b5n,
      0x5521c431308a6efc8c363111c4d8231ac92f951c2da53ea2504c6edc5a4a4fd1n,
    ]

    const root = merkleHelper.createTree(leaves).getRoot()
    expect(root).toBe(0xba3a455ea84cbf420ac7f5b37b70c44d4f2f91085bddf530d9fd9d88e60da9f6n)

    deployer = await blockchain.treasury('deployer')
    let result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('100000'),
      asSnakeDataUint(leaves, 256),
      Cell.EMPTY,
      1n,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })

    expect(await calculator.getRoot()).toBe(root)

    leaves = [0x5521c431308a6efc8c363111c4d8231ac92f951c2da53ea2504c6edc5a4a4fd1n]
    let proofs = [0x67ac797670796606fd0b57bf1898120c1652696dca3f06bff9fccb9f808539b5n]

    // separate one hash into leaves another one into proofs
    result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('10'),
      asSnakeDataUint(leaves, 256),
      asSnakeDataUint(proofs, 256),
      1n,
    )

    expect(await calculator.getRoot()).toBe(root)

    leaves = [0x67ac797670796606fd0b57bf1898120c1652696dca3f06bff9fccb9f808539b5n]
    proofs = [0x5521c431308a6efc8c363111c4d8231ac92f951c2da53ea2504c6edc5a4a4fd1n]

    // separate one hash into leaves another one into proofs
    result = await calculator.sendMerkleRoot(
      deployer.getSender(),
      toNano('10'),
      asSnakeDataUint(leaves, 256),
      asSnakeDataUint(proofs, 256),
      0n,
    )

    expect(await calculator.getRoot()).toBe(root)
  })
})
