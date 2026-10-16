import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { createCursePolicy } from '../../../wrappers/ccip/Router'
import { contractCode } from '../../../wrappers/codeLoader'
import { WRAPPED_NATIVE, generateRandomContractId } from '../../../src/utils'
import { deployOffRampContract } from '../offramp/OffRamp.Setup'
import { ChainSelectors } from '../../utils/Selectors'

const SUBJECT = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001
const SYNC_COST = toNano('0.05')

describe('Router.curseSync', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let offRamp: SandboxContract<of.OffRamp>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    router = blockchain.openContract(
      rt.Router.fromStorage(
        rt.Storage.create({
          id: generateRandomContractId(),
          ownable: rt.Ownable2Step.create({ owner: deployer.address }),
          wrappedNative: WRAPPED_NATIVE,
          onRamps: new Map(),
          offRamps: new Map(),
          rmnRemote: rt.RMNRemote.create({
            policy: createCursePolicy(deployer.address),
            forwardUpdates: new Map(),
          }),
        }),
        { overrideContractCode: await contractCode.ccip.local('Router') },
      ),
    )
    await router.sendDeploy(deployer.getSender(), toNano('1'))

    offRamp = await deployOffRampContract(blockchain, deployer, undefined, {
      rmnRouter: router.address,
    })
  })

  async function registerOffRamp() {
    const result = await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('1'), {
      queryId: 0n,
      offRampAdds: rt.OffRamps.create({
        sourceChainSelectors: [SUBJECT],
        offRamp: offRamp.address,
      }),
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: true,
    })
    return result
  }

  async function curse(value = toNano('1')) {
    const result = await router.sendRouterRMNRemoteCurse(deployer.getSender(), value, {
      queryId: 0n,
      subjects: [SUBJECT],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: true,
    })
    return result
  }

  async function ackedVersions(): Promise<[string, bigint][]> {
    const versions = await router.getRmnOffRampCursedSubjectsVersions()
    return [...versions.entries()].map(([addr, v]) => [addr.toString(), v])
  }

  async function expectOffRampSynced(version: bigint, cursed: boolean) {
    expect(await router.getRmnCursedSubjectsVersion()).toBe(version)
    expect(await ackedVersions()).toEqual([[offRamp.address.toString(), version]])
    expect(await router.getRmnAllOffRampsSynced()).toBe(true)
    expect(await offRamp.getCursedSubjectsVersion()).toBe(version)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(!cursed)
  }

  it('propagates curse and uncurse to OffRamps and records their acknowledgment', async () => {
    await registerOffRamp()
    expect(await router.getRmnAllOffRampsSynced()).toBe(true)

    const cursed = await curse()
    expect(cursed.transactions).toHaveTransaction({
      from: router.address,
      to: offRamp.address,
      op: of.OffRamp_SyncCursedSubjects.PREFIX,
      success: true,
    })
    expect(cursed.transactions).toHaveTransaction({
      from: offRamp.address,
      to: router.address,
      op: rt.Router_RMNRemoteCursedSubjectsAck.PREFIX,
      success: true,
    })
    await expectOffRampSynced(1n, true)

    await router.sendRouterRMNRemoteUncurse(deployer.getSender(), toNano('1'), {
      queryId: 0n,
      subjects: [SUBJECT],
    })
    await expectOffRampSynced(2n, false)
  })

  it('syncs the existing curse to an OffRamp registered after the curse', async () => {
    await curse()
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(true)

    const result = await registerOffRamp()
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: offRamp.address,
      op: of.OffRamp_SyncCursedSubjects.PREFIX,
      success: true,
    })
    await expectOffRampSynced(1n, true)
  })

  it('reports an undelivered curse as unsynced and recovers via SyncOffRamps', async () => {
    await registerOffRamp()

    // Leave the Router unable to fund the forwarded update.
    const routerContract = await blockchain.getContract(router.address)
    routerContract.balance = 0n
    const cursed = await curse(toNano('0.02'))
    expect(cursed.transactions).not.toHaveTransaction({
      from: router.address,
      to: offRamp.address,
    })

    // The curse is stored locally, but the OffRamp is not enforcing it.
    expect(await router.getVerifyNotCursed(SUBJECT)).toBe(false)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(true)
    expect(await router.getRmnCursedSubjectsVersion()).toBe(1n)
    expect(await ackedVersions()).toEqual([[offRamp.address.toString(), 0n]])
    expect(await router.getRmnAllOffRampsSynced()).toBe(false)

    const underfunded = await router.sendRouterRMNRemoteSyncOffRamps(
      deployer.getSender(),
      SYNC_COST - 1n,
      { queryId: 0n },
    )
    expect(underfunded.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.InsufficientFee'],
    })

    // Anyone can push the Router's state to unsynced OffRamps.
    const anyone = await blockchain.treasury('anyone')
    const synced = await router.sendRouterRMNRemoteSyncOffRamps(anyone.getSender(), SYNC_COST, {
      queryId: 0n,
    })
    expect(synced.transactions).toHaveTransaction({
      from: anyone.address,
      to: router.address,
      success: true,
    })
    await expectOffRampSynced(1n, true)

    const noop = await router.sendRouterRMNRemoteSyncOffRamps(anyone.getSender(), toNano('0.01'), {
      queryId: 0n,
    })
    expect(noop.transactions).toHaveTransaction({
      from: anyone.address,
      to: router.address,
      success: true,
    })
    expect(noop.transactions).not.toHaveTransaction({
      from: router.address,
      to: offRamp.address,
    })
  })

  it('rejects acknowledgments from unregistered senders', async () => {
    await registerOffRamp()
    const stranger = await blockchain.treasury('stranger')
    const result = await router.sendRouterRMNRemoteCursedSubjectsAck(
      stranger.getSender(),
      toNano('0.05'),
      { version: 1n },
    )
    expect(result.transactions).toHaveTransaction({
      from: stranger.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOffRamp'],
    })
  })

  it('OffRamp ignores stale curse state and acknowledges the version it enforces', async () => {
    const rmnRouter = await blockchain.treasury('rmnRouter')
    const ramp = await deployOffRampContract(blockchain, deployer, undefined, {
      rmnRouter: rmnRouter.address,
    })

    await ramp.sendOffRampSyncCursedSubjects(rmnRouter.getSender(), SYNC_COST, {
      version: 2n,
      cursedSubjects: of.CursedSubjects.create({ data: new Set([SUBJECT]) }),
    })
    const stale = await ramp.sendOffRampSyncCursedSubjects(rmnRouter.getSender(), SYNC_COST, {
      version: 1n,
      cursedSubjects: of.CursedSubjects.create({ data: new Set() }),
    })

    expect(await ramp.getCursedSubjectsVersion()).toBe(2n)
    expect(await ramp.getVerifyNotCursed(SUBJECT)).toBe(false)
    expect(stale.transactions).toHaveTransaction({
      from: ramp.address,
      to: rmnRouter.address,
      op: rt.Router_RMNRemoteCursedSubjectsAck.PREFIX,
      body: (b) =>
        b !== undefined &&
        rt.Router_RMNRemoteCursedSubjectsAck.fromSlice(b.beginParse()).version === 2n,
    })
  })
})
