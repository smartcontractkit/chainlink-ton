import '@ton/test-utils'
import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, toNano, beginCell } from '@ton/core'
import { SigningKey, randomBytes, computeAddress } from 'ethers'

import * as coverage from '../coverage/coverage'

import { generateRandomContractId, DUMMY_ADDRESS } from '../../src/utils'
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
  address: string
  keyPair: SigningKey
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

  testID = 0
  testSuite: string
  snapshot: BlockchainSnapshot
  snapshotState: {
    testSigners: TestSigner[]
    testGroupQuorums: Map<number, number>
    testGroupParents: Map<number, number>
    signerGroups: number[]
    testConfig: mcms.Config
    bindAddresses: {
      mcms: Address
      counter: Address
    }
  } | null

  constructor(testSuite: string) {
    this.blockchain = null as any
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
    this.testSigners = []
    this.testGroupQuorums = new Map<number, number>()
    this.testGroupParents = new Map<number, number>()
    this.signerGroups = []
    this.testConfig = null as any
    this.testSuite = testSuite
    this.snapshot = null as any
    this.snapshotState = null
  }

  static async beforeAll(testSuite: string): Promise<MCMSBaseTestSetup> {
    const self = new MCMSBaseTestSetup(testSuite)
    await self.beforeAll()
    self.saveSnapshot()
    return self
  }

  saveSnapshot() {
    this.snapshot = this.blockchain.snapshot()
    this.snapshotState = {
      testSigners: this.cloneTestSigners(this.testSigners),
      testGroupQuorums: new Map(this.testGroupQuorums),
      testGroupParents: new Map(this.testGroupParents),
      signerGroups: [...this.signerGroups],
      testConfig: this.cloneConfig(this.testConfig),
      bindAddresses: {
        mcms: this.bind.mcms.address,
        counter: this.bind.counter.address,
      },
    }
  }

  async beforeAll() {
    await this.initializeBlockchain()
    await this.compileContracts()
    await this.setupTestConfiguration()
    await this.setupMCMSContract()
    await this.deployMCMSContract()
    await this.setupCounterContract()
    await this.deployCounterContract()
    await this.setInitialConfiguration()
  }

  async beforeEach() {
    await this.blockchain.loadFrom(this.snapshot)
    this.restoreSnapshotState()
  }

  async compileContracts(): Promise<void> {
    this.code = await MCMSBaseTestSetup.compileContracts()
  }

  static async compileContracts(): Promise<MCMSTestCode> {
    return {
      mcms: await mcms.ContractClient.code(),
      counter: await counter.ContractClient.code(),
    }
  }

  /**
   * Generate deterministic test signers with private keys
   */
  async generateTestSigners(): Promise<TestSigner[]> {
    const signers: TestSigner[] = []

    let keyPairs = Array.from(
      { length: MCMSBaseTestSetup.SIGNERS_NUM },
      (_, i) => new SigningKey(randomBytes(32)),
    )

    // Sort result by public key (strictly increasing)
    keyPairs.sort((a, b) => {
      const aAddr = BigInt(computeAddress(a))
      const bAddr = BigInt(computeAddress(b))
      return aAddr < bAddr ? -1 : aAddr > bAddr ? 1 : 0
    })

    for (let i = 0; i < MCMSBaseTestSetup.SIGNERS_NUM; i++) {
      // This is a simplified approach - in real tests you might want to use actual key generation
      const address = computeAddress(keyPairs[i])
      const group = (i % MCMSBaseTestSetup.NUM_SUBGROUPS) + 1 // Plus one because we don't want signers in root group

      signers.push({
        address,
        keyPair: keyPairs[i],
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
    if (process.env['COVERAGE'] === 'true') {
      this.blockchain.enableCoverage()
      this.blockchain.verbosity.print = false
      this.blockchain.verbosity.vmLogs = 'vm_logs_verbose'
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
          address: BigInt(signer.address),
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
  async setupMCMSContract(): Promise<void> {
    const data: mcms.ContractData = {
      id: Number(generateRandomContractId()),
      ownable: {
        owner: this.acc.multisigOwner.address,
        pendingOwner: null,
      },
      oracle: DUMMY_ADDRESS,
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
            opPendingReceiver: null,
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

  async setupCounterContract(): Promise<void> {
    const data = {
      id: Number(generateRandomContractId()),
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
        signerAddresses: this.testSigners.map((s) => BigInt(s.address)),
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
   * Move time forward by a specific period (in seconds)
   */
  warpTime(period: number) {
    this.blockchain.now = this.blockchain.now!! + period
  }

  private restoreSnapshotState() {
    if (!this.snapshotState) {
      throw new Error('Snapshot state not initialized. Did you call saveSnapshot()?')
    }

    const {
      bindAddresses,
      testSigners,
      testGroupParents,
      testGroupQuorums,
      testConfig,
      signerGroups,
    } = this.snapshotState

    this.testSigners = this.cloneTestSigners(testSigners)
    this.testGroupParents = new Map(testGroupParents)
    this.testGroupQuorums = new Map(testGroupQuorums)
    this.signerGroups = [...signerGroups]
    this.testConfig = this.cloneConfig(testConfig)

    this.bind.mcms = this.blockchain.openContract(
      mcms.ContractClient.createFromAddress(bindAddresses.mcms),
    )
    this.bind.counter = this.blockchain.openContract(
      counter.ContractClient.createFromAddress(bindAddresses.counter),
    )
  }

  private cloneTestSigners(signers: TestSigner[]): TestSigner[] {
    return signers.map((signer) => ({ ...signer, keyPair: signer.keyPair }))
  }

  private cloneConfig(config: mcms.Config): mcms.Config {
    const signers = new Map<number, Buffer>()
    for (const [idx, data] of config.signers.entries()) {
      signers.set(idx, Buffer.from(data))
    }

    return {
      signers,
      groupQuorums: new Map(config.groupQuorums),
      groupParents: new Map(config.groupParents),
    }
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

  async generateCoverageArtifacts() {
    await coverage.generateCoverageArtifacts(
      this.blockchain,
      `mcms_${this.testSuite}_${this.testID++}`,
      [
        {
          code: this.code.mcms,
          name: 'mcms',
        },
      ],
    )
  }
}

// Extended base test for SetRoot and Execute operations
export class MCMSBaseSetRootAndExecuteTestSetup extends MCMSBaseTestSetup {
  // Test operations and Merkle tree data
  testOps: mcms.Op[]
  initialTestRootMetadata: mcms.RootMetadata
  opProofs: bigint[][] // Proofs for each operation
  snapshotTestOps: mcms.Op[] | null
  snapshotOpProofs: bigint[][] | null
  snapshotRootMetadata: mcms.RootMetadata | null

  static readonly OPS_NUM = 7
  static readonly REVERTING_OP_INDEX = 5
  static readonly VALUE_OP_INDEX = 6
  static readonly LEAVES_NUM = 8
  static readonly ROOT_METADATA_LEAF_INDEX = 0

  constructor(testSuite: string) {
    super(testSuite)
    this.testOps = []
    this.initialTestRootMetadata = null as any
    this.opProofs = []
    this.snapshotTestOps = null
    this.snapshotOpProofs = null
    this.snapshotRootMetadata = null
  }

  static async beforeAll(
    testSuite: string,
    options?: { setInitialRoot?: boolean },
  ): Promise<MCMSBaseSetRootAndExecuteTestSetup> {
    const optionals = { setInitialRoot: true, ...options }
    const self = new MCMSBaseSetRootAndExecuteTestSetup(testSuite)
    await self.beforeAll()
    await self.setupForSetRootAndExecute()
    if (optionals.setInitialRoot) {
      await self.setInitialRoot()
    }
    self.saveSnapshot()
    return self
  }

  async beforeEach() {
    await super.beforeEach()
    this.restoreSnapshotData()
  }

  saveSnapshot() {
    super.saveSnapshot()
    this.snapshotTestOps = this.cloneOps(this.testOps)
    this.snapshotOpProofs = this.cloneOpProofs(this.opProofs)
    this.snapshotRootMetadata = { ...this.initialTestRootMetadata }
  }

  /**
   * Setup for SetRoot and Execute tests
   */
  private async setupForSetRootAndExecute(): Promise<void> {
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

    const signers = this.testSigners.map((s) => s.keyPair)
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

  private restoreSnapshotData() {
    if (!this.snapshotTestOps || !this.snapshotOpProofs || !this.snapshotRootMetadata) {
      throw new Error('Snapshot data not initialized. Call saveSnapshot() after setup.')
    }
    this.testOps = this.cloneOps(this.snapshotTestOps)
    this.opProofs = this.cloneOpProofs(this.snapshotOpProofs)
    this.initialTestRootMetadata = { ...this.snapshotRootMetadata }
  }

  private cloneOps(ops: mcms.Op[]): mcms.Op[] {
    return ops.map((op) => ({ ...op }))
  }

  private cloneOpProofs(proofs: bigint[][]): bigint[][] {
    return proofs.map((proof) => [...proof])
  }
}
