import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, toNano, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import { KeyPair, sign } from '@ton/crypto'
import { crc32 } from 'zlib'

import { generateEd25519KeyPair, uint8ArrayToBigInt, ZERO_ADDRESS } from '../../src/utils'
import * as mcms from '../../wrappers/mcms/MCMS'
import { merkleProof } from '../../src/mcms'
import * as counter from '../../wrappers/examples/Counter'

export type MCMSTestCode = {
  mcms: Cell
  counter: Cell
}

export type MCMSTestAccounts = {
  deployer: SandboxContract<TreasuryContract>
  multisigOwner: SandboxContract<TreasuryContract>
  // 9 signers with their private keys
  signers: SandboxContract<TreasuryContract>[]
}

export type MCMSTestContracts = {
  mcms: SandboxContract<mcms.ContractClient>
  counter: SandboxContract<counter.ContractClient>
}

export type TestSigner = {
  address: Address
  keyPair: KeyPair
  wallet: SandboxContract<TreasuryContract>
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

  static readonly OP_FINALIZATION_TIMEOUT_ZERO = 0

  blockchain: Blockchain
  code: MCMSTestCode
  acc: MCMSTestAccounts
  bind: MCMSTestContracts

  // Test configuration
  testSigners: TestSigner[]
  testGroupQuorums: Map<number, number>
  testGroupParents: Map<number, number>
  signerGroups: number[]
  testConfig: mcms.Config

  constructor() {
    this.blockchain = null as any
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
    this.testSigners = []
    this.testGroupQuorums = new Map<number, number>()
    this.testGroupParents = new Map<number, number>()
    this.signerGroups = []
    this.testConfig = null as any
  }

  static async compileContracts(): Promise<MCMSTestCode> {
    return {
      mcms: await compile('mcms.MCMS'),
      counter: await compile('examples.Counter'),
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
        wallet: this.acc.signers[i],
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
      signers,
    }

    this.bind = {
      mcms: null as any,
      counter: null as any,
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
    const signers = new Map<number, Buffer>()
    for (let i = 0; i < this.testSigners.length; i++) {
      const signer = this.testSigners[i]
      const signerData = mcms.builder.data.signer
        .encode({
          key: BigInt('0x' + signer.keyPair.publicKey.toString('hex')),
          index: signer.index,
          group: signer.group,
        })
        .asCell()
      signers.set(i, signerData.toBoc())
    }

    const groupQuorums = new Map<number, number>()
    const groupParents = new Map<number, number>()

    for (let i = 0; i < MCMSBaseTestSetup.MAX_NUM_GROUPS && i < this.testGroupQuorums.size; i++) {
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
      oracle: ZERO_ADDRESS,
      signers: new Map<bigint, Buffer>(),
      config: {
        signers: new Map<number, Buffer>(),
        groupQuorums: new Map<number, number>(),
        groupParents: new Map<number, number>(),
      },
      seenSignedHashes: new Map<bigint, boolean>(),
      rootInfo: {
        expiringRootAndOpCount: {
          root: 0n,
          validUntil: 0n,
          opCount: 0n,
          opPendingInfo: {
            validAfter: 0n,
            opFinalizationTimeout: MCMSBaseTestSetup.OP_FINALIZATION_TIMEOUT_ZERO,
            opPendingReceiver: ZERO_ADDRESS,
            opPendingBodyTruncated: 0n,
          },
        },
        rootMetadata: {
          chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
          multiSig: Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2'), // Will be updated after deployment
          preOpCount: 0n,
          postOpCount: 0n,
          overridePreviousRoot: false,
        },
      },
    }

    this.bind.mcms = this.blockchain.openContract(mcms.ContractClient.newFrom(data, this.code.mcms))

    // Update the multiSig address in rootMetadata
    data.rootInfo.rootMetadata.multiSig = this.bind.mcms.address
  }

  /**
   * Deploy the MCMS contract and verify deployment
   */
  async deployMCMSContract(): Promise<void> {
    const body = Cell.EMPTY
    const result = await this.bind.mcms.sendInternal(
      this.acc.deployer.getSender(),
      toNano('2'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.mcms.address,
      deploy: true,
      success: true,
    })
  }

  async setupCounterContract(testId: string): Promise<void> {
    const data = {
      id: crc32(`mcms.counter.${testId}`),
      value: 0,
      ownable: {
        owner: this.bind.mcms.address,
        pendingOwner: null,
      },
    }
    this.bind.counter = this.blockchain.openContract(
      counter.ContractClient.newFrom(data, this.code.counter),
    )
  }

  /**
   * Deploy the Counter contract and verify deployment
   */
  async deployCounterContract(): Promise<void> {
    const result = await this.bind.counter.sendInternal(
      this.acc.deployer.getSender(),
      toNano('2'),
      Cell.EMPTY,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.counter.address,
      deploy: true,
      success: true,
    })
  }

  /**
   * Set the initial configuration on the MCMS contract
   */
  async setInitialConfiguration(): Promise<void> {
    // Build signer addresses cell

    // Build signer groups cell

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys: this.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
        signerGroups: this.testSigners.map((s) => s.group),
        groupQuorums: this.testConfig.groupQuorums,
        groupParents: this.testConfig.groupParents,
        clearRoot: false,
      })
      .asCell()

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
    await this.setupCounterContract(testId)
    await this.deployCounterContract()
    await this.setInitialConfiguration()
  }

  /**
   * Move time forward by a specific period (in seconds)
   */
  warpTime(period: number) {
    this.blockchain.now = this.blockchain.now!! + period
  }

  /**
   * Create multiple test operations
   */
  createTestOps(count: number, includeRevertingOp: boolean = true, startNonce = 0): mcms.Op[] {
    const ops: mcms.Op[] = []
    for (let i = 0; i < count; i++) {
      const value =
        i == MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX ? toNano('10') : toNano('0.10')

      // default op
      let op = counter.builder.message.in.setCount
        .encode({
          queryId: BigInt(i + startNonce),
          newCount: i + startNonce,
        })
        .asCell()

      {
        switch (i) {
          case MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX:
            if (includeRevertingOp) {
              op = beginCell().storeUint(0xffffffff, 32).asCell()
            } else {
              // use default op
            }
            break
          case MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX:
            op = Cell.EMPTY
            break
          default:
            // use default op
            break
        }
      }

      ops.push({
        chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
        multiSig: this.bind.mcms.address,
        nonce: BigInt(i + startNonce),
        to: this.bind.counter.address,
        value,
        data: op,
      })
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
  opProofs: bigint[][] // Proofs for each operation

  static readonly OPS_NUM = 7
  static readonly REVERTING_OP_INDEX = 5
  static readonly VALUE_OP_INDEX = 6
  static readonly LEAVES_NUM = 8
  static readonly ROOT_METADATA_LEAF_INDEX = 0

  constructor() {
    super()
    this.testOps = []
    this.initialTestRootMetadata = null as any
    this.opProofs = []
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

  // Recreate test operations (skip reverting op for this test setup)
  async recreateTestOpsNoRevertingOp(): Promise<void> {
    // Notice: needs setting new root with new metadata
    const includeRevertingOp = false
    this.testOps = this.createTestOps(
      MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM,
      includeRevertingOp,
    )
    await this.setInitialRoot(
      this.createTestRootMetadata(
        0n,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM),
        true, // override root
      ),
    )
  }

  /**
   * Get the leaf index for a specific operation
   */
  getLeafIndexOfOp(opIndex: number): number {
    return MCMSBaseSetRootAndExecuteTestSetup.ROOT_METADATA_LEAF_INDEX + 1 + opIndex
  }

  /**
   * Set the initial root using merkle proof helper
   */
  async setInitialRoot(rootMetadata = this.initialTestRootMetadata): Promise<void> {
    this.initialTestRootMetadata = rootMetadata

    const signers = this.testSigners.map((s) => ({
      publicKey: s.keyPair.publicKey,
      sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
    }))

    const [setRoot, opProofs] = merkleProof.build(
      signers,
      MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL,
      rootMetadata,
      this.testOps,
    )

    // Store the operation proofs for later use in execute tests
    this.opProofs = opProofs

    const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot).asCell()

    const result = await this.bind.mcms.sendInternal(
      this.acc.deployer.getSender(),
      toNano('0.05'),
      setRootBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.mcms.address,
      success: true,
    })
  }

  /**
   * Get proof for a specific operation index
   */
  getProofForOp(opIndex: number): bigint[] {
    if (this.opProofs.length === 0) {
      throw new Error('opProofs not initialized. Call setInitialRoot() first.')
    }
    return this.opProofs[opIndex]
  }

  // Execute all operations up to the post-op count limit to simulate setOpCount
  async executeOperationsUpTo(index: number) {
    for (let i = 0; i < index; i++) {
      const executeBody = mcms.builder.message.in.execute
        .encode({
          queryId: BigInt(i + 1),
          op: mcms.builder.data.op.encode(this.testOps[i]).asCell(),
          proof: this.opProofs[i],
        })
        .asCell()

      const result = await this.bind.mcms.sendInternal(
        this.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: this.acc.deployer.address,
        to: this.bind.mcms.address,
        success: true,
      })
    }
  }
}
