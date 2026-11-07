import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { merkleProof } from '../../src/mcms'
import * as mcms from '../../wrappers/mcms/MCMS'

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

const groupForIndex = (index: number) => (index % (mcms.NUM_GROUPS - 1)) + 1

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

const expectSuccess = <T extends { exitCode: number }>(result: T): T => {
  expect(result.exitCode).toBe(0)
  return result
}

describe('MCMS - staged setConfig', () => {
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

  const begin = (queryId = 1n, config = allGroupsConfig()) =>
    send(mcms.builder.message.in.beginConfigStaging.encode({ queryId, ...config }).endCell())

  const beginSession = async (queryId = 1n, config = allGroupsConfig()) => {
    expectSuccess(await begin(queryId, config))
    return config
  }

  const stageSigners = (
    addresses: bigint[],
    groups: number[],
    expectedNumSigners = 0,
    queryId = 1n,
  ) =>
    send(
      mcms.builder.message.in.stageConfig
        .encode({ queryId, expectedNumSigners, signerAddresses: addresses, signerGroups: groups })
        .endCell(),
    )

  const stage = (offset: number, count: number, expectedNumSigners = 0, queryId = 1n) => {
    const addresses = deterministicSigners(offset, count)
    return stageSigners(
      addresses,
      addresses.map((_, i) => groupForIndex(i)),
      expectedNumSigners,
      queryId,
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

  const stagedSignerCount = () => baseTest.bind.mcms.getStagedConfigNumSigners()
  const activeSignerCount = async () => (await baseTest.bind.mcms.getConfig()).signers.size

  describe('chunk validation', () => {
    it('rejects a chunk from a different session', async () => {
      await beginSession()

      const result = await stage(0, 32, 0, 2n)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingSessionMismatch)
      expect(await stagedSignerCount()).toBe(0)
    })

    it('rejects a chunk larger than the stage limit', async () => {
      await beginSession()

      const result = await stage(0, mcms.MAX_SIGNERS_PER_STAGE + 1)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingChunkTooLarge)
      expect(await stagedSignerCount()).toBe(0)
    })

    it('rejects replaying a chunk in the same session', async () => {
      await beginSession()
      expectSuccess(await stage(0, 16))

      const result = await stage(0, 16)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingIncomplete)
      expect(await stagedSignerCount()).toBe(16)
    })

    it('rejects a stale chunk from an earlier session', async () => {
      await beginSession()
      expectSuccess(await stage(0, 16))

      await beginSession(2n)
      const result = await stage(0, 16, 0, 1n)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingSessionMismatch)
      expect(await stagedSignerCount()).toBe(0)
    })

    it('rejects an out-of-order chunk', async () => {
      await beginSession()
      expectSuccess(await stage(0, 32))
      expect(await stagedSignerCount()).toBe(32)

      const result = await stage(32, 32, 0)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingIncomplete)
      expect(await stagedSignerCount()).toBe(32)
    })

    it('rejects commit before all signers are staged', async () => {
      await beginSession()
      expectSuccess(await stage(0, 32))

      const result = await commit(69)

      expect(result.exitCode).toBe(mcms.Error.ConfigStagingIncomplete)
      expect(await activeSignerCount()).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
    })

    it('validates the group tree at commit, not at stage time', async () => {
      const config = {
        groupQuorums: new Map<number, number>([
          [0, 1],
          [1, 0],
        ]),
        groupParents: new Map<number, number>([
          [0, 0],
          [1, 0],
        ]),
      }
      await beginSession(1n, config)
      expectSuccess(await stage(0, 16))

      const result = await commit(16)

      expect(result.exitCode).toBe(mcms.Error.SignerInDisabledGroup)
      expect(await activeSignerCount()).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
    })
  })

  describe('session lifecycle', () => {
    it('aborts staging without touching the active config', async () => {
      await beginSession()
      expectSuccess(await stage(0, 32))
      expect(await stagedSignerCount()).toBe(32)

      expectSuccess(await abort())

      expect(await stagedSignerCount()).toBe(0)
      expect(await activeSignerCount()).toBe(MCMSBaseTestSetup.SIGNERS_NUM)
    })

    it('clears staged state when setConfig is called directly', async () => {
      await beginSession()
      expectSuccess(await stage(0, 32))

      const setConfig = mcms.builder.message.in.setConfig
        .encode({
          queryId: 0n,
          signerAddresses: baseTest.testSigners.map((signer) => BigInt(signer.address)),
          signerGroups: baseTest.signerGroups,
          groupQuorums: baseTest.testGroupQuorums,
          groupParents: baseTest.testGroupParents,
          clearRoot: false,
        })
        .endCell()

      expectSuccess(await send(setConfig))
      expect(await stagedSignerCount()).toBe(0)
    })

    it('allows setRoot after committing the staged config', async () => {
      await beginSession(1n, {
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
      })
      expectSuccess(
        await stageSigners(
          baseTest.testSigners.map((signer) => BigInt(signer.address)),
          baseTest.signerGroups,
        ),
      )
      expectSuccess(await commit(baseTest.testSigners.length))

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

      expectSuccess(await send(mcms.builder.message.in.setRoot.encode(setRoot).asCell()))
    })

    it('stages and commits a config that clears the root', async () => {
      await beginSession()
      expectSuccess(await stage(0, 32))

      expectSuccess(await commit(32, true))

      const [root, validUntil] = await baseTest.bind.mcms.getRoot()
      expect(root).toBe(0n)
      expect(validUntil).toBe(0n)
    })
  })
})
