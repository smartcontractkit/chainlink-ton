import { toNano } from '@ton/core'
import '@ton/test-utils'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as ownable2Step from '../../wrappers/libraries/access/Ownable2Step'

import { MCMSBaseTestSetup, MCMSTestCode, TestSigner } from './ManyChainMultiSigBaseTest'

describe('MCMS - ManyChainMultiSigSetConfigTest', () => {
  let baseTest: MCMSBaseTestSetup

  beforeAll(async () => {
    baseTest = await MCMSBaseTestSetup.beforeAll('set_config')
  })

  beforeEach(async () => {
    await baseTest.beforeEach()
  })

  const cloneTestSigners = (): TestSigner[] => baseTest.testSigners.map((signer) => ({ ...signer }))

  it('should fail if non-owner tries to set config', async () => {
    // Try to call setConfig from non-owner address (should fail)
    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: ownable2Step.Errors.OnlyCallableByOwner,
    })
  })

  it('should fail on invalid configuration - empty signers list', async () => {
    // Empty signers list should fail
    const emptySignerList: TestSigner[] = []
    const emptySignerAddresses = emptySignerList.map((s) => BigInt(s.address))
    const emptySignerGroups = emptySignerList.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: emptySignerAddresses,
        signerGroups: emptySignerGroups,
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.OutOfBoundsNumSigners,
    })
  })

  it('should fail on invalid configuration - duplicate signers', async () => {
    // Create duplicate signers (signers must be strictly increasing)

    const duplicateSigners = cloneTestSigners()
    duplicateSigners[1] = { ...duplicateSigners[1], address: duplicateSigners[0].address }
    const signerAddresses = duplicateSigners.map((s) => BigInt(s.address))
    const signerGroups = duplicateSigners.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses,
        signerGroups,
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.SignersAdderssesMustBeStrictlyIncreasing,
    })
  })

  it('should fail on invalid configuration - out of bounds group', async () => {
    // Set a signer to an invalid group (MAX_NUM_GROUPS + 1)
    const invalidGroupSigners = cloneTestSigners()
    invalidGroupSigners[0].group = mcms.NUM_GROUPS + 1

    const signerAddresses = invalidGroupSigners.map((s) => BigInt(s.address))
    const signerGroups = invalidGroupSigners.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses,
        signerGroups,
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.OutOfBoundsGroup,
    })
  })

  it('should fail on invalid configuration - too large group quorum', async () => {
    // Set quorum larger than number of signers
    const invalidGroupQuorums = new Map<number, number>()
    for (let i = 0; i < mcms.NUM_GROUPS; i++) {
      if (i === 0) {
        invalidGroupQuorums.set(i, MCMSBaseTestSetup.SIGNERS_NUM + 1) // Too large
      } else {
        invalidGroupQuorums.set(i, baseTest.testGroupQuorums.get(i) || 0)
      }
    }

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: invalidGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.OutOfBoundsGroupQuorum,
    })
  })

  it('should fail on invalid configuration - malformed group tree (root not self-parent)', async () => {
    // Root group (0) should have itself as parent, not another group
    const invalidGroupParents = new Map<number, number>()
    for (let i = 0; i < mcms.NUM_GROUPS; i++) {
      if (i === 0) {
        invalidGroupParents.set(i, 1) // Invalid: root should be self-parent (0)
      } else {
        invalidGroupParents.set(i, baseTest.testGroupParents.get(i) || 0)
      }
    }

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: invalidGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.GroupTreeNotWellFormed,
    })
  })

  it('should fail on invalid configuration - malformed group tree (group self-parent)', async () => {
    // Non-root group should not have itself as parent
    const invalidGroupParents = new Map<number, number>()
    for (let i = 0; i < mcms.NUM_GROUPS; i++) {
      if (i === 1) {
        invalidGroupParents.set(i, 1) // Invalid: group 1 has itself as parent
      } else {
        invalidGroupParents.set(i, baseTest.testGroupParents.get(i) || 0)
      }
    }

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: invalidGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.GroupTreeNotWellFormed,
    })
  })

  it('should fail on invalid configuration - signer in disabled group', async () => {
    // Put a signer in a disabled group (group with quorum 0)
    const disabledGroupSigners = cloneTestSigners()
    disabledGroupSigners[1].group = mcms.NUM_GROUPS - 1 // Last group should be disabled

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: disabledGroupSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.SignerInDisabledGroup,
    })
  })

  it('should fail on invalid configuration - mismatched signer and group lengths', async () => {
    // Create mismatched lengths (fewer groups than signers)
    const signer = baseTest.testSigners.slice(0, 4)
    const shorterSignerGroup = baseTest.testSigners.slice(0, 3)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: signer.map((s) => BigInt(s.address)),
        signerGroups: shorterSignerGroup.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('0.05'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.SignerGroupsLengthMismatch,
    })
  })

  it('should successfully set config without clearing root', async () => {
    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('1'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Verify a ConfigSet confirmation was replied
    expect(result.transactions).toHaveTransaction({
      from: baseTest.bind.mcms.address,
      op: mcms.opcodes.out.ConfigSet,
    })

    // Verify the configuration was set correctly
    const config = await baseTest.bind.mcms.getConfig()
    expect(config.signers.size).toBe(MCMSBaseTestSetup.SIGNERS_NUM)

    // Verify group quorums match
    for (let i = 0; i < 4; i++) {
      expect(config.groupQuorums.get(i)).toBe(baseTest.testGroupQuorums.get(i))
    }

    // Verify group parents match
    for (let i = 0; i < 4; i++) {
      expect(config.groupParents.get(i)).toBe(baseTest.testGroupParents.get(i))
    }
  })

  it('should successfully set config and clear root', async () => {
    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.map((s) => BigInt(s.address)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: true, // Clear the root
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('1'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Verify a ConfigSet confirmation was replied
    expect(result.transactions).toHaveTransaction({
      from: baseTest.bind.mcms.address,
      op: mcms.opcodes.out.ConfigSet,
    })

    // Verify the root was cleared
    const [root, validUntil] = await baseTest.bind.mcms.getRoot()
    expect(root).toBe(0n)
    expect(validUntil).toBe(0n)

    // Verify root metadata shows override flag
    const rootMetadata = await baseTest.bind.mcms.getRootMetadata()
    expect(rootMetadata.chainId).toBe(-239n) // Note: global chain ID (signed int)
    expect(rootMetadata.multiSig).toEqualAddress(baseTest.bind.mcms.address)
    expect(rootMetadata.overridePreviousRoot).toBe(true)

    // Pre and post op counts should be equal (current op count)
    const opCount = await baseTest.bind.mcms.getOpCount()
    expect(rootMetadata.preOpCount).toBe(opCount)
    expect(rootMetadata.postOpCount).toBe(opCount)
  })

  it('should successfully set opFinalizationTimeout config', async () => {
    const body = mcms.builder.message.in.updateOpFinalizationTimeout
      .encode({ queryId: 1n, newOpFinalizationTimeout: 10 })
      .asCell()

    const sender = baseTest.acc.multisigOwner.getSender()
    const result = await baseTest.bind.mcms.sendInternal(sender, toNano('0.1'), body)

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Verify contract replied
    expect(result.transactions).toHaveTransaction({
      from: baseTest.bind.mcms.address,
      op: mcms.opcodes.out.OpFinalizationTimeoutChange,
    })

    // Verify state was updated
    const info = await baseTest.bind.mcms.getOpPendingInfo()
    expect(info).not.toBeNull()
    expect(info.opFinalizationTimeout).toBe(10)
  })

  it('should successfully set config - MCMS e2e tests config example', async () => {
    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerAddresses: baseTest.testSigners.slice(0, 2).map((s) => BigInt(s.address)),
        signerGroups: [0, 1],
        groupQuorums: new Map([
          [0, 1],
          [1, 1],
        ]),
        groupParents: new Map([
          [0, 0],
          [1, 0],
        ]),
        clearRoot: true, // Clear the root
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('1'),
      setConfigBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Verify a ConfigSet confirmation was replied
    expect(result.transactions).toHaveTransaction({
      from: baseTest.bind.mcms.address,
      op: mcms.opcodes.out.ConfigSet,
    })

    // Verify the root was cleared
    const [root, validUntil] = await baseTest.bind.mcms.getRoot()
    expect(root).toBe(0n)
    expect(validUntil).toBe(0n)

    // Verify the configuration was set correctly
    const config = await baseTest.bind.mcms.getConfig()
    expect(config.signers.size).toBe(2)
    expect(config.groupQuorums.size).toBe(2)
    expect(config.groupParents.size).toBe(2)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await baseTest.generateCoverageArtifacts()
    }
  })
})
