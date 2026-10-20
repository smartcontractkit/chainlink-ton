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
const BASE_FEE = toNano('0.05')
const PER_OFF_RAMP_FEE = toNano('0.05')

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
            forwardUpdates: new Set(),
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
  }

  function curse(value: bigint) {
    return router.sendRouterRMNRemoteCurse(deployer.getSender(), value, {
      queryId: 0n,
      subjects: [SUBJECT],
    })
  }

  function expectPropagated(result: Awaited<ReturnType<typeof curse>>) {
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: offRamp.address,
      op: of.OffRamp_UpdateCursedSubjects.PREFIX,
      success: true,
    })
  }

  it('requires a fee covering propagation to every OffRamp', async () => {
    expect(await router.getRmnUpdateCursedSubjectsFee()).toBe(BASE_FEE)
    await registerOffRamp()
    expect(await router.getRmnUpdateCursedSubjectsFee()).toBe(BASE_FEE + PER_OFF_RAMP_FEE)
  })

  it('rejects an underfunded curse without storing it, and succeeds when retried', async () => {
    await registerOffRamp()
    const fee = await router.getRmnUpdateCursedSubjectsFee()

    const underfunded = await curse(fee - 1n)
    expect(underfunded.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.InsufficientFee'],
    })
    expect(await router.getVerifyNotCursed(SUBJECT)).toBe(true)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(true)

    const retried = await curse(fee)
    expect(retried.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: true,
    })
    expectPropagated(retried)
    expect(await router.getVerifyNotCursed(SUBJECT)).toBe(false)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(false)
  })

  it('propagates a funded curse even when the Router has no balance of its own', async () => {
    await registerOffRamp()
    const routerContract = await blockchain.getContract(router.address)
    routerContract.balance = 0n

    const result = await curse(await router.getRmnUpdateCursedSubjectsFee())
    expectPropagated(result)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(false)
  })

  it('requires the fee for uncurse and propagates it', async () => {
    await registerOffRamp()
    const fee = await router.getRmnUpdateCursedSubjectsFee()
    await curse(fee)

    const underfunded = await router.sendRouterRMNRemoteUncurse(deployer.getSender(), fee - 1n, {
      queryId: 0n,
      subjects: [SUBJECT],
    })
    expect(underfunded.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.InsufficientFee'],
    })
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(false)

    const result = await router.sendRouterRMNRemoteUncurse(deployer.getSender(), fee, {
      queryId: 0n,
      subjects: [SUBJECT],
    })
    expectPropagated(result)
    expect(await router.getVerifyNotCursed(SUBJECT)).toBe(true)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(true)
  })

  it('syncs an existing curse to an OffRamp registered after it', async () => {
    await curse(await router.getRmnUpdateCursedSubjectsFee())
    await registerOffRamp()
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(true)

    const fee = await router.getRmnUpdateCursedSubjectsFee()
    const anyone = await blockchain.treasury('anyone')

    const underfunded = await router.sendRouterRMNRemoteSyncOffRamps(anyone.getSender(), fee - 1n, {
      queryId: 0n,
    })
    expect(underfunded.transactions).toHaveTransaction({
      from: anyone.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.InsufficientFee'],
    })

    const synced = await router.sendRouterRMNRemoteSyncOffRamps(anyone.getSender(), fee, {
      queryId: 0n,
    })
    expect(synced.transactions).toHaveTransaction({
      from: anyone.address,
      to: router.address,
      success: true,
    })
    expectPropagated(synced)
    expect(await offRamp.getVerifyNotCursed(SUBJECT)).toBe(false)
  })
})
