import '@ton/test-utils'

import { toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import { EventTopics } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  EntryErrors,
  Fixture,
  RegistryErrors,
  coverageConfig,
  createBlockchain,
  entryAddress,
  entryFor,
  expectEntryFailure,
  expectEntrySuccess,
  expectRootFailure,
  registerAndAccept,
  registerToken,
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
      }),
    )
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

  it('requires value for a possible entry upgrade', async () => {
    await registerAndAccept(fx)
    const result = await setPool(fx, fx.administrator, fx.replacementPool, 0n, toNano('0.03'))
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
