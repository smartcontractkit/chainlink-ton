import '@ton/test-utils'

import { toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import { Costs, EventTopics } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  EntryErrors,
  OPERATION_VALUE,
  Fixture,
  RegistryErrors,
  coverageConfig,
  createBlockchain,
  entryAddress,
  answerPoolProbe,
  entryFor,
  expectEntryFailure,
  expectEntrySuccess,
  expectRootFailure,
  registerAndAccept,
  registerToken,
  requestSetPool,
  rootEvent,
  rootEvents,
  setPool,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - Set Pool', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  it('lets the active administrator update the pool and relays the event', async () => {
    await registerAndAccept(fx)
    const result = await setPool(fx, fx.administrator, fx.replacementPool, 104n)
    expectEntrySuccess(fx, result)

    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, fx.replacementPool))
    expect(
      tar.TokenAdminRegistry_PoolSet.fromSlice(rootEvent(fx, result, EventTopics.PoolSet)),
    ).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        queryId: 104n,
        token: fx.token,
        previousPool: fx.pool,
        newPool: fx.replacementPool,
        transferInitiator: null,
      }),
    )
  })

  it('stores the transfer initiator with the pool and emits PoolSet when only the initiator changes', async () => {
    await registerAndAccept(fx)
    const initiator = fx.other.address

    const result = await setPool(fx, fx.administrator, fx.pool, 105n, undefined, initiator)
    expectEntrySuccess(fx, result)
    expect((await entryFor(fx).getTokenInfo()).transferInitiator).toEqualAddress(initiator)
    expect(
      tar.TokenAdminRegistry_PoolSet.fromSlice(rootEvent(fx, result, EventTopics.PoolSet)),
    ).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        queryId: 105n,
        token: fx.token,
        previousPool: fx.pool,
        newPool: fx.pool,
        transferInitiator: initiator,
      }),
    )

    const noOp = await setPool(fx, fx.administrator, fx.pool, 106n, undefined, initiator)
    expectEntrySuccess(fx, noOp)
    expect(rootEvents(fx, noOp, EventTopics.PoolSet)).toHaveLength(0)

    const cleared = await setPool(fx, fx.administrator, fx.pool, 107n)
    expect((await entryFor(fx).getTokenInfo()).transferInitiator).toBeNull()
    expect(rootEvents(fx, cleared, EventTopics.PoolSet)).toHaveLength(1)
  })

  it('keeps the current pool until the new pool answers the transfer initiator probe', async () => {
    await registerAndAccept(fx)
    const result = await requestSetPool(fx, fx.administrator, fx.replacementPool, 110n)
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.replacementPool,
      op: tare.TokenPool_GetTransferInitiator.PREFIX,
    })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx))
    expect(rootEvents(fx, result, EventTopics.PoolSet)).toHaveLength(0)

    await answerPoolProbe(fx, { from: fx.replacementPool, queryId: 110n })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, fx.replacementPool))
  })

  it('ignores a transfer initiator answer from a pool that is neither pending nor current', async () => {
    await registerAndAccept(fx)
    await requestSetPool(fx, fx.administrator, fx.replacementPool)
    await answerPoolProbe(fx, { from: fx.other.address, transferInitiator: fx.other.address })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx))
  })

  it('delists the token when the new pool bounces the transfer initiator probe', async () => {
    await registerAndAccept(fx)
    // The registry root rejects the unknown probe message, so it bounces back to the entry.
    const rejectingPool = fx.registry.address
    const result = await requestSetPool(fx, fx.administrator, rejectingPool, 112n)
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, null))
    expect(
      tar.TokenAdminRegistry_PoolSet.fromSlice(rootEvent(fx, result, EventTopics.PoolSet)),
    ).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        queryId: 112n,
        token: fx.token,
        previousPool: fx.pool,
        newPool: null,
        transferInitiator: null,
      }),
    )

    // A late answer from the rejected pool does not list it.
    await answerPoolProbe(fx, { from: rejectingPool })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, null))
  })

  it('lets anyone refresh the transfer initiator reported by the current pool', async () => {
    await registerAndAccept(fx)
    const refresh = await fx.registry.sendTokenAdminRegistryRefreshTransferInitiator(
      fx.other.getSender(),
      OPERATION_VALUE,
      { queryId: 111n, tokenAddress: fx.token },
    )
    expect(refresh.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.pool,
      op: tare.TokenPool_GetTransferInitiator.PREFIX,
    })

    const answer = await answerPoolProbe(fx, {
      transferInitiator: fx.other.address,
      queryId: 111n,
    })
    expect((await entryFor(fx).getTokenInfo()).transferInitiator).toEqualAddress(fx.other.address)
    expect(
      tar.TokenAdminRegistry_PoolSet.fromSlice(rootEvent(fx, answer, EventTopics.PoolSet)),
    ).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        queryId: 111n,
        token: fx.token,
        previousPool: fx.pool,
        newPool: fx.pool,
        transferInitiator: fx.other.address,
      }),
    )
  })

  it('re-probes a pending pool that has not answered on refresh', async () => {
    await registerAndAccept(fx)
    await requestSetPool(fx, fx.administrator, fx.replacementPool)
    const refresh = await fx.registry.sendTokenAdminRegistryRefreshTransferInitiator(
      fx.other.getSender(),
      OPERATION_VALUE,
      { queryId: 113n, tokenAddress: fx.token },
    )
    expect(refresh.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.replacementPool,
      op: tare.TokenPool_GetTransferInitiator.PREFIX,
    })
    expect(refresh.transactions).not.toHaveTransaction({
      from: entryAddress(fx),
      to: fx.pool,
      op: tare.TokenPool_GetTransferInitiator.PREFIX,
    })
  })

  it('does not set the pool given at registration until it answers the probe', async () => {
    const result = await registerToken(fx, { answerPoolProbe: false })
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.pool,
      op: tare.TokenPool_GetTransferInitiator.PREFIX,
    })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, null))
  })

  it('delists and relists a token', async () => {
    await registerAndAccept(fx)

    const delist = await setPool(fx, fx.administrator, null)
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, null))
    const delistEvent = tar.TokenAdminRegistry_PoolSet.fromSlice(
      rootEvent(fx, delist, EventTopics.PoolSet),
    )
    expect(delistEvent.previousPool).toEqualAddress(fx.pool)
    expect(delistEvent.newPool).toBeNull()

    const noOp = await setPool(fx, fx.administrator, null)
    expectEntrySuccess(fx, noOp)
    expect(rootEvents(fx, noOp, EventTopics.PoolSet)).toHaveLength(0)

    const relist = await setPool(fx, fx.administrator, fx.replacementPool)
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx, fx.replacementPool))
    const relistEvent = tar.TokenAdminRegistry_PoolSet.fromSlice(
      rootEvent(fx, relist, EventTopics.PoolSet),
    )
    expect(relistEvent.previousPool).toBeNull()
    expect(relistEvent.newPool).toEqualAddress(fx.replacementPool)
  })

  it('does not notify the root when the pool is unchanged', async () => {
    await registerAndAccept(fx)
    const result = await setPool(fx, fx.administrator, fx.pool)
    expectEntrySuccess(fx, result)
    expect(result.transactions).not.toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
    })
  })

  it('rejects anyone but the active administrator', async () => {
    await registerAndAccept(fx)
    for (const actor of [fx.other, fx.owner]) {
      const result = await setPool(fx, actor, fx.replacementPool)
      expectEntryFailure(fx, result, EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'])
    }
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx))
  })

  it('rejects the pending administrator before acceptance', async () => {
    await registerToken(fx)
    const result = await setPool(fx, fx.administrator, fx.replacementPool)
    expectEntryFailure(fx, result, EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'])
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx))
  })

  it('requires the forward cost', async () => {
    await registerAndAccept(fx)
    const result = await setPool(fx, fx.administrator, fx.replacementPool, 0n, Costs.setPool - 1n)
    expectRootFailure(
      fx,
      result,
      fx.administrator.address,
      RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
    )
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_set_pool',
        await coverageConfig(),
      )
    }
  })
})
