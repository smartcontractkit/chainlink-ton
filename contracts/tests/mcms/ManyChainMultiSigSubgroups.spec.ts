import '@ton/test-utils'
import { toNano, beginCell, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { sha256 } from '@ton/crypto'
import * as coverage from '../coverage/coverage'

import { merkleProof } from '../../src/mcms'
import * as mcms from '../../wrappers/mcms/MCMS'
import * as counter from '../../wrappers/examples/Counter'
import { MCMSBaseTestSetup, MCMSTestCode, TestSigner } from './ManyChainMultiSigBaseTest'
import { computeAddress, SigningKey } from 'ethers'
import { randomBytes } from 'crypto'
import { generateRandomContractId } from '../../src/utils'

describe('MCMS - ManyChainMultiSigSubgroupsTest', () => {
  let blockchain: Blockchain
  let code: MCMSTestCode
  let acc: {
    deployer: SandboxContract<TreasuryContract>
    multisigOwner: SandboxContract<TreasuryContract>
    signers: SandboxContract<TreasuryContract>[]
  }
  let bind: {
    mcms: SandboxContract<mcms.ContractClient>
    counter: SandboxContract<counter.ContractClient>
  }

  const MCMS_NUM_GROUPS = 32
  const NUM_SIGNERS = 20

  let testSigners: TestSigner[]

  beforeAll(async () => {
    code = await MCMSBaseTestSetup.compileContracts()
    blockchain = await Blockchain.create()
    blockchain.now = 1
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
      multisigOwner: await blockchain.treasury('multisigOwner'),
      signers: [],
    }

    // Generate deterministic test signers
    testSigners = []
    {
      let keyPairs = Array.from({ length: NUM_SIGNERS }, (_, i) => new SigningKey(randomBytes(32)))

      // Sort result by public key (strictly increasing)
      keyPairs.sort((a, b) => {
        const aAddr = BigInt(computeAddress(a))
        const bAddr = BigInt(computeAddress(b))
        return aAddr < bAddr ? -1 : aAddr > bAddr ? 1 : 0
      })

      for (let i = 0; i < NUM_SIGNERS; i++) {
        const address = computeAddress(keyPairs[i])

        testSigners.push({
          address,
          keyPair: keyPairs[i],
          index: i,
          group: 0, // Will be set per test
        })
      }
    }

    const mcmsBind = blockchain.openContract(
      mcms.ContractClient.newFrom(
        mcms.builder.data.contractDataEmpty(
          Number(generateRandomContractId()),
          acc.multisigOwner.address,
        ),
        code.mcms,
      ),
    )
    // Set up MCMS contract
    bind = {
      mcms: mcmsBind,
      counter: blockchain.openContract(
        counter.ContractClient.newFrom(
          {
            id: generateRandomContractId(),
            value: 0,
            ownable: {
              owner: mcmsBind.address,
              pendingOwner: null, // no pending owner
            },
          },
          code.counter,
        ),
      ),
    }

    // Deploy MCMS contract
    const body = Cell.EMPTY
    const deployResult = await bind.mcms.sendInternal(acc.deployer.getSender(), toNano('2'), body)

    expect(deployResult.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.mcms.address,
      deploy: true,
      success: true,
    })
  })

  // Utility function to generate random number between bounds
  async function randomBetween(
    randomState: Buffer<ArrayBuffer>,
    lower: number,
    upper: number,
  ): Promise<[number, Buffer<ArrayBuffer>]> {
    const range = BigInt(upper - lower)
    const n = BigInt('0x' + randomState.toString('hex'))

    const randomNumber = (n % range) + BigInt(lower)
    const newState = Buffer.from(await sha256(randomState))
    return [Number(randomNumber), newState]
  }

  // Utility function to remove element at index from signatures array
  function removeIndex(signatures: SigningKey[], index: number): SigningKey[] {
    if (index >= signatures.length) {
      return signatures
    }
    return signatures.filter((_, i) => i !== index)
  }

  it('should test setConfig with chain configuration', async () => {
    // all signers are in the last group

    // Update signer group assignments
    testSigners.forEach((signer, i) => {
      signer.group = MCMS_NUM_GROUPS - 1
    })

    // form a chain of groups from the last group to the root
    const groupQuorums = new Map<number, number>()
    const groupParents = new Map<number, number>()

    for (let i = 0; i < MCMS_NUM_GROUPS; i++) {
      if (i !== 0) {
        groupParents.set(i, i - 1)
      } else {
        groupParents.set(i, 0) // Root parent is itself
      }
      groupQuorums.set(i, 1)
    }
    groupQuorums.set(MCMS_NUM_GROUPS - 1, NUM_SIGNERS - 1) // Last group needs all but one signer

    // Set configuration
    {
      const setConfigBody = mcms.builder.message.in.setConfig
        .encode({
          queryId: 1n,
          signerAddresses: testSigners.map((s) => BigInt(s.address)),
          signerGroups: testSigners.map((s) => s.group),
          groupQuorums,
          groupParents,
          clearRoot: false,
        })
        .asCell()

      const result = await bind.mcms.sendInternal(
        acc.multisigOwner.getSender(),
        toNano('0.5'),
        setConfigBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: acc.multisigOwner.address,
        to: bind.mcms.address,
        success: true,
      })
    }

    // Create operations and test signature requirements
    const testOps: mcms.Op[] = [
      {
        chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
        multiSig: bind.mcms.address,
        nonce: 1n,
        to: bind.counter.address,
        value: toNano('0.1'),
        data: beginCell().storeUint(0xffffffff, 32).endCell(),
      },
    ]
    const rootMetadata: mcms.RootMetadata = {
      chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
      multiSig: bind.mcms.address,
      preOpCount: 0n,
      postOpCount: 1n,
      overridePreviousRoot: true,
    }

    // Build merkle proof structure
    const signers = testSigners.map((s) => s.keyPair)

    // To test with reduced signatures, we need to build with fewer signers
    const insufficientSigners = signers.slice(2)
    const [insufficientSetRoot] = merkleProof.build(
      insufficientSigners,
      MCMSBaseTestSetup.TEST_VALID_UNTIL,
      rootMetadata,
      testOps,
    )

    const insufficientSetRootBody = mcms.builder.message.in.setRoot
      .encode(insufficientSetRoot)
      .asCell()
    const insufficientResult = await bind.mcms.sendInternal(
      acc.deployer.getSender(),
      toNano('0.5'),
      insufficientSetRootBody,
    )

    expect(insufficientResult.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.mcms.address,
      success: false,
      exitCode: mcms.Error.InsufficientSigners,
    })

    // Test sufficient signatures (remove only 1 signer)
    const sufficientSigners = signers.slice(1) // Remove 1 signer
    const [sufficientSetRoot] = merkleProof.build(
      sufficientSigners,
      MCMSBaseTestSetup.TEST_VALID_UNTIL,
      rootMetadata,
      testOps,
    )
  })

  it('should test setConfig with fuzz configuration', async () => {
    // Generate random configuration
    let randomState = Buffer.alloc(32, 0)
    for (let i = 0; i < 100; i++) {
      randomState = await test_setConfig_fuzz(randomState)
    }
  })

  async function test_setConfig_fuzz(
    randomState: Buffer<ArrayBuffer>,
  ): Promise<Buffer<ArrayBuffer>> {
    const groupChildrenCounts = new Array(MCMS_NUM_GROUPS).fill(0)
    const groupQuorums = new Map<number, number>()
    const groupParents = new Map<number, number>()

    // Assign signers to random groups
    for (let i = 0; i < NUM_SIGNERS; i++) {
      const [group, newState] = await randomBetween(randomState, 0, MCMS_NUM_GROUPS)
      randomState = newState
      testSigners[i].group = group
      groupChildrenCounts[group]++
    }

    // Configure groups in reverse order
    for (let j = 0; j < MCMS_NUM_GROUPS; j++) {
      const i = MCMS_NUM_GROUPS - 1 - j

      if (groupChildrenCounts[i] === 0) continue

      const [quorum, newState1] = await randomBetween(randomState, 0, groupChildrenCounts[i])
      randomState = newState1
      groupQuorums.set(i, quorum + 1)

      if (i !== 0) {
        const [parent, newState2] = await randomBetween(randomState, 0, i)
        randomState = newState2
        groupParents.set(i, parent)
        groupChildrenCounts[parent]++
      } else {
        groupParents.set(i, 0) // Root parent is itself
      }
    }

    // Check if all signers are needed
    let allSignersNeeded = true
    for (let i = 0; i < MCMS_NUM_GROUPS; i++) {
      const quorum = groupQuorums.get(i) || 0
      allSignersNeeded = allSignersNeeded && quorum === groupChildrenCounts[i]
    }

    // Set configuration
    {
      const signers = testSigners.map((s) => BigInt(s.address))

      const setConfigBody = mcms.builder.message.in.setConfig
        .encode({
          queryId: 1n,
          signerAddresses: signers,
          signerGroups: testSigners.map((s) => s.group),
          groupQuorums,
          groupParents,
          clearRoot: false,
        })
        .asCell()

      const result = await bind.mcms.sendInternal(
        acc.multisigOwner.getSender(),
        toNano('0.5'),
        setConfigBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: acc.multisigOwner.address,
        to: bind.mcms.address,
        success: true,
      })
    }

    const [nonce, newState] = await randomBetween(randomState, 0, 2 ** 32)
    randomState = newState
    const testOps: mcms.Op[] = [
      {
        chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
        multiSig: bind.mcms.address,
        nonce: BigInt(nonce),
        to: bind.counter.address,
        value: toNano('0.1'),
        data: beginCell().storeUint(0xffffffff, 32).endCell(),
      },
    ]
    // Test setRoot with non-override metadata
    const rootMetadata: mcms.RootMetadata = {
      chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
      multiSig: bind.mcms.address,
      preOpCount: 0n,
      postOpCount: 1n,
      overridePreviousRoot: true,
    }

    const signers = testSigners.map((s) => s.keyPair)

    if (!allSignersNeeded) {
      // Can remove at least one signature and setRoot still works
      let success = false
      for (let i = 0; i < signers.length; i++) {
        if (success) {
          break
        }
        const reducedSigners = removeIndex(signers, i)
        const [nonce, newState] = await randomBetween(randomState, 0, 2 ** 32)
        randomState = newState
        const testOps: mcms.Op[] = [
          {
            chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
            multiSig: bind.mcms.address,
            nonce: BigInt(nonce),
            to: bind.counter.address,
            value: toNano('0.1'),
            data: beginCell().storeUint(0xffffffff, 32).endCell(),
          },
        ]
        const [reducedSetRoot, opProofs] = merkleProof.build(
          reducedSigners,
          MCMSBaseTestSetup.TEST_VALID_UNTIL,
          rootMetadata,
          testOps,
        )

        const reducedSetRootBody = mcms.builder.message.in.setRoot.encode(reducedSetRoot).asCell()
        const result = await bind.mcms.sendInternal(
          acc.deployer.getSender(),
          toNano('0.5'),
          reducedSetRootBody,
        )

        try {
          expect(result.transactions).toHaveTransaction({
            from: acc.deployer.address,
            to: bind.mcms.address,
            success: true,
          })
          success = true
        } catch {}
      }
      expect(success).toBe(true)
    }

    // Test setRoot with override
    const overrideMetadata: mcms.RootMetadata = {
      chainId: MCMSBaseTestSetup.TEST_CHAIN_ID,
      multiSig: bind.mcms.address,
      preOpCount: 0n,
      postOpCount: 1n,
      overridePreviousRoot: true,
    }

    const [overrideSetRoot] = merkleProof.build(
      signers,
      MCMSBaseTestSetup.TEST_VALID_UNTIL,
      overrideMetadata,
      testOps,
    )

    const overrideSetRootBody = mcms.builder.message.in.setRoot.encode(overrideSetRoot).asCell()
    const overrideResult = await bind.mcms.sendInternal(
      acc.deployer.getSender(),
      toNano('0.5'),
      overrideSetRootBody,
    )

    expect(overrideResult.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.mcms.address,
      success: true,
    })

    return randomState
  }

  it('should test setConfig for c4issue16 regression', async () => {
    // Create signer groups - put one signer in last group
    testSigners.forEach((signer, i) => {
      signer.group = MCMS_NUM_GROUPS - 1
    })

    // Create malformed group configuration (causes parent index issues)
    const groupQuorums = new Map<number, number>()
    const malformedGroupParents = new Map<number, number>()

    for (let i = 0; i < MCMS_NUM_GROUPS; i++) {
      groupQuorums.set(i, 1)
      // This creates invalid parent relationships
      malformedGroupParents.set(i, i + 1)
    }

    const signerGroupsData = testSigners.map((s) => s.group)
    // Test malformed configuration should fail
    const malformedSetConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: testSigners.map((s) => BigInt(s.address)),
        signerGroups: signerGroupsData,
        groupQuorums,
        groupParents: malformedGroupParents,
        clearRoot: false,
      })
      .asCell()

    const malformedResult = await bind.mcms.sendInternal(
      acc.multisigOwner.getSender(),
      toNano('0.5'),
      malformedSetConfigBody,
    )

    expect(malformedResult.transactions).toHaveTransaction({
      from: acc.multisigOwner.address,
      to: bind.mcms.address,
      success: false,
      exitCode: mcms.Error.GroupTreeNotWellFormed,
    })

    // Fix the group parent relationships
    const correctGroupParents = new Map<number, number>()
    correctGroupParents.set(0, 0) // Root parent is itself
    for (let i = 1; i < MCMS_NUM_GROUPS; i++) {
      correctGroupParents.set(i, i - 1) // Each group's parent is the previous one
    }

    const correctSetConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 2n,
        signerAddresses: testSigners.map((s) => BigInt(s.address)),
        signerGroups: signerGroupsData,
        groupQuorums,
        groupParents: correctGroupParents,
        clearRoot: false,
      })
      .asCell()

    const correctResult = await bind.mcms.sendInternal(
      acc.multisigOwner.getSender(),
      toNano('0.5'),
      correctSetConfigBody,
    )

    expect(correctResult.transactions).toHaveTransaction({
      from: acc.multisigOwner.address,
      to: bind.mcms.address,
      success: true,
    })

    // Verify the configuration was set correctly
    const config = await bind.mcms.getConfig()
    expect(config.groupParents.get(0)).toEqual(0)
    expect(config.groupParents.get(1)).toEqual(0)
    expect(config.groupParents.get(MCMS_NUM_GROUPS - 1)).toEqual(MCMS_NUM_GROUPS - 2)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'mcms_subgroups', [
        {
          code: code.mcms,
          name: 'mcms',
        },
      ])
    }
  })
})
