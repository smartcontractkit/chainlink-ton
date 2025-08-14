import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, Dictionary, toNano, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import { randomBytes } from 'crypto'
import { KeyPair, sign } from '@ton/crypto'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { crc32 } from 'zlib'
import { asSnakeData, uint8ArrayToBigInt } from '../../src/utils'
import { generateEd25519KeyPair } from '../libraries/ocr/Helpers'

export interface MCMSTestCode {
  mcms: Cell
}

export interface MCMSTestAccounts {
  deployer: SandboxContract<TreasuryContract>
  multisigOwner: SandboxContract<TreasuryContract>
  externalCaller: SandboxContract<TreasuryContract>
  // 9 signers with their private keys
  signers: SandboxContract<TreasuryContract>[]
}

export interface MCMSTestContracts {
  mcms: SandboxContract<mcms.ContractClient>
}

export interface TestSigner {
  address: Address
  keyPair: KeyPair
  treasury: SandboxContract<TreasuryContract>
  index: number
  group: number
}

export class MCMSBaseTestSetup {
  // Test configuration constants
  static readonly SIGNERS_NUM = 9
  static readonly NUM_SUBGROUPS = 3 // SIGNERS_NUM/3 in each group
  static readonly MAX_NUM_GROUPS = 32
  static readonly GROUP0_QUORUM = 2
  static readonly GROUP1_QUORUM = 3
  static readonly GROUP2_QUORUM = 2
  static readonly GROUP3_QUORUM = 1
  static readonly GROUP0_PARENT = 0
  static readonly GROUP1_PARENT = 0
  static readonly GROUP2_PARENT = 0
  static readonly GROUP3_PARENT = 0
  static readonly TEST_CHAIN_ID = -239n // TODO: blockchain global chain ID (will need to be signed int)
  static readonly TEST_VALID_UNTIL = 1000000

  blockchain: Blockchain
  code: MCMSTestCode
  acc: MCMSTestAccounts
  bind: MCMSTestContracts

  // Test configuration
  testSigners: TestSigner[]
  testGroupQuorums: Dictionary<number, number>
  testGroupParents: Dictionary<number, number>
  signerGroups: number[]
  testConfig: mcms.Config

  constructor() {
    this.blockchain = null as any
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
    this.testSigners = []
    this.testGroupQuorums = Dictionary.empty<number, number>(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Uint(8),
    )
    this.testGroupParents = Dictionary.empty<number, number>(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Uint(8),
    )
    this.signerGroups = []
    this.testConfig = null as any
  }

  static async compileContracts(): Promise<MCMSTestCode> {
    return {
      mcms: await compile('mcms.MCMS'),
    }
  }

  /**
   * Generate deterministic test signers with private keys
   */
  async generateTestSigners(): Promise<TestSigner[]> {
    const signers: TestSigner[] = []

    let keyPairs = await Promise.all(
      Array.from(
        { length: MCMSBaseTestSetup.SIGNERS_NUM },
        async (_, i) => await generateEd25519KeyPair(),
      ),
    )

    // Sort result by public key (strictly increasing)
    keyPairs.sort((a, b) => {
      const aKey = uint8ArrayToBigInt(a.publicKey)
      const bKey = uint8ArrayToBigInt(b.publicKey)
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
    })

    for (let i = 0; i < MCMSBaseTestSetup.SIGNERS_NUM; i++) {
      // This is a simplified approach - in real tests you might want to use actual key generation
      const address = this.acc.signers[i].address
      const group = (i % MCMSBaseTestSetup.NUM_SUBGROUPS) + 1 // Plus one because we don't want signers in root group

      signers.push({
        address,
        keyPair: keyPairs[i],
        treasury: this.acc.signers[i],
        index: i,
        group,
      })
    }

    return signers
  }

  /**
   * Initialize the blockchain and setup accounts
   */
  async initializeBlockchain(): Promise<void> {
    this.blockchain = await Blockchain.create()
    this.blockchain.now = 1
    this.blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }

    // Set blockchain to use our test chain ID
    // Note: TON Sandbox doesn't directly support setting chain ID
    // but the MCMS contract should use the chain ID from the metadata

    // Set up accounts
    const signers: SandboxContract<TreasuryContract>[] = []
    for (let i = 0; i < MCMSBaseTestSetup.SIGNERS_NUM; i++) {
      signers.push(await this.blockchain.treasury(`signer${i}`))
    }

    this.acc = {
      deployer: await this.blockchain.treasury('deployer'),
      multisigOwner: await this.blockchain.treasury('multisigOwner'),
      externalCaller: await this.blockchain.treasury('externalCaller'),
      signers,
    }

    this.bind = {
      mcms: null as any,
    }
  }

  /**
   * Setup test configuration (groups, quorums, signers)
   */
  async setupTestConfiguration(): Promise<void> {
    // Generate test signers
    this.testSigners = await this.generateTestSigners()

    // Assign the required quorum in each group
    this.testGroupQuorums.set(0, MCMSBaseTestSetup.GROUP0_QUORUM)
    this.testGroupQuorums.set(1, MCMSBaseTestSetup.GROUP1_QUORUM)
    this.testGroupQuorums.set(2, MCMSBaseTestSetup.GROUP2_QUORUM)
    this.testGroupQuorums.set(3, MCMSBaseTestSetup.GROUP3_QUORUM)

    // Set parent relationships (all groups have root as parent)
    this.testGroupParents.set(0, MCMSBaseTestSetup.GROUP0_PARENT)
    this.testGroupParents.set(1, MCMSBaseTestSetup.GROUP1_PARENT)
    this.testGroupParents.set(2, MCMSBaseTestSetup.GROUP2_PARENT)
    this.testGroupParents.set(3, MCMSBaseTestSetup.GROUP3_PARENT)
    this.testGroupQuorums.set(0, MCMSBaseTestSetup.GROUP0_QUORUM)
    this.testGroupQuorums.set(1, MCMSBaseTestSetup.GROUP1_QUORUM)
    this.testGroupQuorums.set(2, MCMSBaseTestSetup.GROUP2_QUORUM)
    this.testGroupQuorums.set(3, MCMSBaseTestSetup.GROUP3_QUORUM)

    // Assign signers to groups
    this.signerGroups = []
    for (let i = 0; i < MCMSBaseTestSetup.SIGNERS_NUM; i++) {
      // Plus one because we don't want signers in root group
      this.signerGroups.push((i % MCMSBaseTestSetup.NUM_SUBGROUPS) + 1)
    }

    // Create the config
    const signers = Dictionary.empty<number, Buffer>(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Buffer(mcms.LEN_SIGNER),
    )
    for (let i = 0; i < this.testSigners.length; i++) {
      const signer = this.testSigners[i]
      const signerData = mcms.builder.data.signer.encode({
        address: signer.address,
        index: signer.index,
        group: signer.group,
      })
      signers.set(i, signerData.toBoc())
    }

    const groupQuorums = Dictionary.empty<number, number>(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Uint(8),
    )
    const groupParents = Dictionary.empty<number, number>(
      Dictionary.Keys.Uint(8),
      Dictionary.Values.Uint(8),
    )

    for (
      let i = 0;
      i < MCMSBaseTestSetup.MAX_NUM_GROUPS && i < this.testGroupQuorums.keys().length;
      i++
    ) {
      const currentGroupQuorum = this.testGroupQuorums.get(i)
      if (currentGroupQuorum && currentGroupQuorum > 0) {
        groupQuorums.set(i, currentGroupQuorum)
      }
      const currentGroupParent = this.testGroupParents.get(i)
      if (currentGroupParent != null) {
        groupParents.set(i, currentGroupParent)
      }
    }

    this.testConfig = {
      signers,
      groupQuorums,
      groupParents,
    }
  }

  /**
   * Setup the MCMS contract
   */
  async setupMCMSContract(testId: string): Promise<void> {
    const data: mcms.ContractData = {
      id: crc32(`mcms.test.${testId}`),
      ownable: {
        owner: this.acc.multisigOwner.address,
        pendingOwner: null,
      },
      signers: Dictionary.empty<bigint, Buffer>(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Buffer(mcms.LEN_SIGNER),
      ),
      config: {
        signers: Dictionary.empty<number, Buffer>(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Buffer(mcms.LEN_SIGNER),
        ),
        groupQuorums: Dictionary.empty<number, number>(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
        ),
        groupParents: Dictionary.empty<number, number>(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
        ),
      },
      seenSignedHashes: Dictionary.empty<bigint, boolean>(
        Dictionary.Keys.BigInt(256),
        Dictionary.Values.Bool(),
      ),
      expiringRootAndOpCount: {
        root: 0n,
        validUntil: 0n,
        opCount: 0n,
      },
      rootMetadata: {
        chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
        multiSig: Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2'), // Will be updated after deployment
        preOpCount: 0n,
        postOpCount: 0n,
        overridePreviousRoot: false,
      },
    }

    this.bind.mcms = this.blockchain.openContract(mcms.ContractClient.newFrom(data, this.code.mcms))

    // Update the multiSig address in rootMetadata
    data.rootMetadata.multiSig = this.bind.mcms.address
  }

  /**
   * Deploy the MCMS contract and verify deployment
   */
  async deployMCMSContract(): Promise<void> {
    const body = mcms.builder.message.in.topUp.encode({ queryId: 1n })
    const result = await this.bind.mcms.sendInternal(
      this.acc.deployer.getSender(),
      toNano('0.05'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.mcms.address,
      deploy: true,
      success: true,
    })
  }

  /**
   * Set the initial configuration on the MCMS contract
   */
  async setInitialConfiguration(): Promise<void> {
    // Build signer addresses cell
    const signerKeys = asSnakeData<bigint>(
      this.testSigners.map((s) => BigInt('0x' + s.keyPair.publicKey.toString('hex'))),
      (a) => beginCell().storeUint(a, 256),
    )

    // Build signer groups cell
    const signerGroups = asSnakeData<number>(
      this.testSigners.map((s) => s.group),
      (g) => beginCell().storeUint(g, 8),
    )

    const setConfigBody = mcms.builder.message.in.setConfig.encode({
      queryId: 1n,
      signerKeys,
      signerGroups,
      groupQuorums: this.testConfig.groupQuorums,
      groupParents: this.testConfig.groupParents,
      clearRoot: false,
    })

    const result = await this.bind.mcms.sendInternal(
      this.acc.multisigOwner.getSender(),
      toNano('1'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.multisigOwner.address,
      to: this.bind.mcms.address,
      success: true,
    })
  }

  /**
   * Complete setup for MCMS contract - convenience method that combines all setup steps
   */
  async setupAll(testId: string): Promise<void> {
    await this.initializeBlockchain()
    await this.setupTestConfiguration()
    await this.setupMCMSContract(testId)
    await this.deployMCMSContract()
    await this.setInitialConfiguration()
  }

  /**
   * Move time forward by a specific period (in seconds)
   */
  warpTime(period: number) {
    this.blockchain.now = this.blockchain.now!! + period
  }

  /**
   * Create a test operation
   */
  createTestOp(nonce: bigint, to: Address, value: bigint, data: Cell): mcms.Op {
    return {
      chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
      multiSig: this.bind.mcms.address,
      nonce,
      to,
      value,
      data,
    }
  }

  /**
   * Create multiple test operations
   */
  createTestOps(count: number): mcms.Op[] {
    const ops: mcms.Op[] = []
    for (let i = 0; i < count; i++) {
      ops.push(
        this.createTestOp(
          BigInt(i),
          this.acc.externalCaller.address,
          toNano('0.1'),
          beginCell().storeUint(i, 32).endCell(),
        ),
      )
    }
    return ops
  }

  /**
   * Create test root metadata
   */
  createTestRootMetadata(
    preOpCount: bigint,
    postOpCount: bigint,
    overridePreviousRoot: boolean = false,
  ): mcms.RootMetadata {
    return {
      chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
      multiSig: this.bind.mcms.address,
      preOpCount,
      postOpCount,
      overridePreviousRoot,
    }
  }

  /**
   * Compute Merkle root from leaves (simplified implementation)
   * In a real implementation, you'd use a proper Merkle tree library
   */
  computeRoot(leaves: Cell[]): bigint {
    if (leaves.length === 0) return 0n
    if (leaves.length === 1) return BigInt('0x' + leaves[0].hash().toString('hex'))

    // Build a simple binary tree by pairing leaves and hashing them
    let currentLevel = leaves.map((leaf) => leaf.hash())

    while (currentLevel.length > 1) {
      const nextLevel: Buffer[] = []

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i]
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left

        // Hash the pair
        const combined = beginCell().storeBuffer(left).storeBuffer(right).endCell()

        nextLevel.push(combined.hash())
      }

      currentLevel = nextLevel
    }

    return BigInt('0x' + currentLevel[0].toString('hex'))
  }
}

// Extended base test for SetRoot and Execute operations
export class MCMSBaseSetRootAndExecuteTestSetup extends MCMSBaseTestSetup {
  // Test operations and Merkle tree data
  testOps: mcms.Op[]
  initialTestRootMetadata: mcms.RootMetadata

  static readonly OPS_NUM = 7
  static readonly REVERTING_OP_INDEX = 5
  static readonly VALUE_OP_INDEX = 6
  static readonly LEAVES_NUM = 8
  static readonly ROOT_METADATA_LEAF_INDEX = 0

  constructor() {
    super()
    this.testOps = []
    this.initialTestRootMetadata = null as any
  }

  /**
   * Setup for SetRoot and Execute tests
   */
  async setupForSetRootAndExecute(testId: string): Promise<void> {
    await this.setupAll(testId)

    // Create test root metadata
    this.initialTestRootMetadata = this.createTestRootMetadata(
      0n,
      BigInt(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM),
      false,
    )

    // Create test operations
    this.testOps = this.createTestOps(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)
  }

  /**
   * Get the leaf index for a specific operation
   */
  getLeafIndexOfOp(opIndex: number): number {
    return MCMSBaseSetRootAndExecuteTestSetup.ROOT_METADATA_LEAF_INDEX + 1 + opIndex
  }
}
