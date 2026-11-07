import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import * as mcms from '../../wrappers/mcms/MCMS'
import { merkleProof } from '../../src/mcms'

import { MCMSBaseTestSetup } from './ManyChainMultiSigBaseTest'

import type { Address } from '@ton/core'
import type { SendMessageResult } from '@ton/sandbox'

const deterministicSigners = (offset: number, count: number): bigint[] =>
  Array.from({ length: count }, (_, i) => BigInt(offset + i + 1))

const allGroupsConfig = () => {
  const groupQuorums = new Map<number, number>()
  const groupParents = new Map<number, number>()
  for (let group = 0; group < mcms.NUM_GROUPS; group++) {
    groupQuorums.set(group, group === 0 ? 2 : 1)
    groupParents.set(group, 0)
  }
  return { groupQuorums, groupParents }
}

const groupForIndex = (i: number) => (i % (mcms.NUM_GROUPS - 1)) + 1

const findMcmsTx = (result: SendMessageResult, address: Address) => {
  const tx = result.transactions.find(
    (candidate) =>
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest.equals(address),
  )
  if (!tx) {
    throw new Error('Missing MCMS transaction')
  }
  return tx
}

const computeGas = (tx: ReturnType<typeof findMcmsTx>) => {
  if (tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') {
    throw new Error('Expected a VM transaction')
  }
  return {
    gasUsed: tx.description.computePhase.gasUsed,
    exitCode: tx.description.computePhase.exitCode,
  }
}

describe('MCMS - staged SetConfig', () => {
  let baseTest: MCMSBaseTestSetup

  beforeAll(async () => {
    baseTest = await MCMSBaseTestSetup.beforeAll('set_config_staged')
  })

  beforeEach(async () => {
    await baseTest.beforeEach()
  })

  const send = async (body: Cell) => {
    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('2'),
      body,
    )
    return { result, ...computeGas(findMcmsTx(result, baseTest.bind.mcms.address)) }
  }

  const begin = (groupQuorums: Map<number, number>, groupParents: Map<number, number>) =>
    send(
      mcms.builder.message.in.beginConfigStaging
        .encode({ queryId: 1n, groupQuorums, groupParents })
        .endCell(),
    )

  const stage = (
    offset: number,
    count: number,
    expectedNumSigners: number,
    groupOffset = 0,
    queryId = 1n,
  ) => {
    const addresses = deterministicSigners(offset, count)
    return send(
      mcms.builder.message.in.stageConfig
        .encode({
          queryId,
          expectedNumSigners,
          signerAddresses: addresses,
          signerGroups: addresses.map((_, i) => groupForIndex(i + groupOffset)),
        })
        .endCell(),
    )
  }

  const commit = (expectedNumSigners: number, clearRoot = false, queryId = 1n) =>
    send(
      mcms.builder.message.in.commitConfig
        .encode({ queryId, expectedNumSigners, clearRoot })
        .endCell(),
    )

  const abort = (queryId = 1n) =>
    send(mcms.builder.message.in.abortConfig.encode({ queryId }).endCell())

  it('rejects a chunk from a different staging session', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)

    const result = await stage(0, 32, 0, 0, 2n)

    expect(result.exitCode).toBe(mcms.Error.ConfigStagingSessionMismatch)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(0)
  })

  it('rejects a chunk larger than the staging size limit', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)

    const result = await stage(0, mcms.MAX_SIGNERS_PER_STAGE + 1, 0)

    expect(result.exitCode).toBe(mcms.Error.ConfigStagingChunkTooLarge)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(0)
  })

  it('rejects a stale chunk from an earlier staging session', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 16, 0, 0, 1n)).exitCode).toBe(0)

    // Start a new session with a different query ID.
    expect(
      (
        await send(
          mcms.builder.message.in.beginConfigStaging
            .encode({ queryId: 2n, groupQuorums, groupParents })
            .endCell(),
        )
      ).exitCode,
    ).toBe(0)

    // A chunk from session 1 must not apply to session 2.
    const result = await stage(0, 16, 0, 0, 1n)
    expect(result.exitCode).toBe(mcms.Error.ConfigStagingSessionMismatch)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(0)
  })

  it('rejects an out-of-order chunk', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 32, 0)).exitCode).toBe(0)

    // expectedNumSigners is stale: the next chunk must start at 32.
    const result = await stage(32, 32, 0)

    expect(result.exitCode).toBe(mcms.Error.ConfigStagingIncomplete)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(32)
  })

  it('rejects commit before all signers are staged', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 32, 0)).exitCode).toBe(0)

    const result = await commit(69)

    expect(result.exitCode).toBe(mcms.Error.ConfigStagingIncomplete)
    // Active config is unchanged.
    expect((await baseTest.bind.mcms.getConfig()).signers.size).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
  })

  it('aborts staging without touching the active config', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 32, 0)).exitCode).toBe(0)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(32)

    expect((await abort()).exitCode).toBe(0)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(0)
    expect((await baseTest.bind.mcms.getConfig()).signers.size).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
  })

  it('clears a staged session when setConfig is called directly', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 32, 0)).exitCode).toBe(0)

    const setConfigBody = mcms.builder.message.in.setConfig
      .encode({
        queryId: 0n,
        signerAddresses: baseTest.testSigners.map((signer) => BigInt(signer.address)),
        signerGroups: baseTest.signerGroups,
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: false,
      })
      .endCell()
    const result = await send(setConfigBody)

    expect(result.exitCode).toBe(0)
    expect(await baseTest.bind.mcms.getStagedConfigNumSigners()).toBe(0)
  })

  it('validates the group tree at commit, not at stage time', async () => {
    // Group 1 is disabled but signers are assigned to it.
    const groupQuorums = new Map<number, number>([
      [0, 1],
      [1, 0],
    ])
    const groupParents = new Map<number, number>([
      [0, 0],
      [1, 0],
    ])

    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 16, 0)).exitCode).toBe(0)

    const result = await commit(16)

    expect(result.exitCode).toBe(mcms.Error.SignerInDisabledGroup)
    expect((await baseTest.bind.mcms.getConfig()).signers.size).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
  })

  it('allows setRoot after committing the staged config', async () => {
    expect((await begin(baseTest.testGroupQuorums, baseTest.testGroupParents)).exitCode).toBe(0)

    const addresses = baseTest.testSigners.map((signer) => BigInt(signer.address))
    const result = await send(
      mcms.builder.message.in.stageConfig
        .encode({
          queryId: 1n,
          expectedNumSigners: 0,
          signerAddresses: addresses,
          signerGroups: baseTest.signerGroups,
        })
        .endCell(),
    )
    expect(result.exitCode).toBe(0)
    expect((await commit(baseTest.testSigners.length)).exitCode).toBe(0)

    const opCount = await baseTest.bind.mcms.getOpCount()
    const ops: mcms.Op[] = [0n, 1n, 2n].map((nonce) => ({
      chainId: -239n,
      multiSig: baseTest.bind.mcms.address,
      nonce,
      to: baseTest.bind.mcms.address,
      value: 0n,
      data: Cell.EMPTY,
    }))
    const [setRoot] = merkleProof.build(
      baseTest.testSigners.map((signer) => signer.keyPair),
      1_000_000n,
      {
        chainId: -239n,
        multiSig: baseTest.bind.mcms.address,
        preOpCount: opCount,
        postOpCount: opCount + BigInt(ops.length),
        overridePreviousRoot: false,
      },
      ops,
    )
    const setRootResult = await send(mcms.builder.message.in.setRoot.encode(setRoot).asCell())
    expect(setRootResult.exitCode).toBe(0)
  })

  it('stages and commits a config that clears the root', async () => {
    const { groupQuorums, groupParents } = allGroupsConfig()
    expect((await begin(groupQuorums, groupParents)).exitCode).toBe(0)
    expect((await stage(0, 32, 0)).exitCode).toBe(0)

    const result = await commit(32, true)
    expect(result.exitCode).toBe(0)

    const [root, validUntil] = await baseTest.bind.mcms.getRoot()
    expect(root).toBe(0n)
    expect(validUntil).toBe(0n)
  })
})
