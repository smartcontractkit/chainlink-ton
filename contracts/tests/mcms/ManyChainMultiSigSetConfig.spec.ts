import '@ton/test-utils'

import { toNano } from '@ton/core'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as ownable2Step from '../../wrappers/libraries/access/Ownable2Step'

import { MCMSBaseTestSetup, MCMSTestCode, TestSigner } from './ManyChainMultiSigBaseTest'
import { uint8ArrayToBigInt } from '../../src/utils'

describe('MCMS - ManyChainMultiSigSetConfigTest', () => {
  let baseTest: MCMSBaseTestSetup
  let code: MCMSTestCode

  beforeAll(async () => {
    code = await MCMSBaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new MCMSBaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-set-config')
  })

  it('should fail if non-owner tries to set config', async () => {
    // Try to call setConfig from non-owner address (should fail)
    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
    const emptySignerKeys = emptySignerList.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey))
    const emptySignerGroups = emptySignerList.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys: emptySignerKeys,
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

    const duplicateSigners = [...baseTest.testSigners]
    duplicateSigners[1] = duplicateSigners[0] // Make addresses duplicate
    const signerKeys = duplicateSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey))
    const signerGroups = duplicateSigners.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys,
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
      exitCode: mcms.Error.SignersKeysMustBeStrictlyIncreasing,
    })
  })

  it('should fail on invalid configuration - out of bounds group', async () => {
    // Set a signer to an invalid group (MAX_NUM_GROUPS + 1)
    const invalidGroupSigners = [...baseTest.testSigners]
    invalidGroupSigners[0].group = mcms.NUM_GROUPS + 1

    const signerKeys = invalidGroupSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey))
    const signerGroups = invalidGroupSigners.map((s) => s.group)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys,
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
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
    const disabledGroupSigners = [...baseTest.testSigners]
    disabledGroupSigners[1].group = mcms.NUM_GROUPS - 1 // Last group should be disabled

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 1n,
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
        signerKeys: signer.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
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
    expect(rootMetadata.chainId).toBe(-239n) // TODO: blockchain global chain ID (will need to be signed int)
    expect(rootMetadata.multiSig).toEqualAddress(baseTest.bind.mcms.address)
    expect(rootMetadata.overridePreviousRoot).toBe(true)

    // Pre and post op counts should be equal (current op count)
    const opCount = await baseTest.bind.mcms.getOpCount()
    expect(rootMetadata.preOpCount).toBe(opCount)
    expect(rootMetadata.postOpCount).toBe(opCount)
  })
})
