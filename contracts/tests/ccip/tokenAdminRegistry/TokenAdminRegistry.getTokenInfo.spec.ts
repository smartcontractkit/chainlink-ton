import '@ton/test-utils'

import { toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import { Costs } from '../../../wrappers/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import {
  EntryErrors,
  Fixture,
  RegistryErrors,
  answerPoolProbe,
  asEntry,
  coverageConfig,
  createBlockchain,
  entryAddress,
  entryFor,
  expectRootFailure,
  failedTokenInfo,
  messageFromRoot,
  registerAndAccept,
  registerToken,
  requestSetPool,
  returnedTokenInfo,
  setPool,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - Get Token Info', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  const getTokenInfo = (queryId = 0n, value = toNano('0.1')) =>
    fx.registry.sendTokenAdminRegistryGetTokenInfo(fx.other.getSender(), value, {
      queryId,
      token: fx.token,
    })

  it('resolves token info through the entry and replies to the requester', async () => {
    await registerToken(fx)
    const result = await getTokenInfo(106n)

    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      op: tare.TokenAdminRegistryEntry_MessageFromRoot.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
      op: tar.TokenAdminRegistryEntry_TokenInfo.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: fx.other.address,
      op: tar.TokenAdminRegistry_TokenInfo.PREFIX,
    })
    expect(returnedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_TokenInfo.create({
        queryId: 106n,
        token: fx.token,
        minterAddress: fx.token,
        tokenPool: fx.pool,
        transferInitiator: null,
        version: 1n,
      }),
    )
  })

  it('notifies the requester when the token is not registered', async () => {
    const result = await getTokenInfo(107n)

    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      op: tare.TokenAdminRegistryEntry_MessageFromRoot.PREFIX,
      aborted: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
      inMessageBounced: true,
      success: true,
    })
    expect(failedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_GetTokenInfoFailed.create({ queryId: 107n, token: fx.token }),
    )
  })

  it('rejects an underfunded query before reaching the entry', async () => {
    await registerToken(fx)
    const result = await getTokenInfo(0n, Costs.getTokenInfo - 1n)
    expectRootFailure(
      fx,
      result,
      fx.other.address,
      RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
    )
    expect(result.transactions).not.toHaveTransaction({ to: entryAddress(fx) })
  })

  it('returns no pool for a delisted token', async () => {
    await registerAndAccept(fx)
    await setPool(fx, fx.administrator, null)

    const result = await getTokenInfo()
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toBeNull()
  })

  it('returns no pool while a pool update awaits the probe answer', async () => {
    await registerAndAccept(fx)
    await requestSetPool(fx, fx.administrator, fx.replacementPool)

    const pending = await getTokenInfo()
    expect(returnedTokenInfo(fx, pending, fx.other.address).tokenPool).toBeNull()

    await answerPoolProbe(fx, { from: fx.replacementPool })
    const answered = await getTokenInfo()
    expect(returnedTokenInfo(fx, answered, fx.other.address).tokenPool).toEqualAddress(
      fx.replacementPool,
    )
  })

  it('returns no pool after the new pool bounced the probe', async () => {
    await registerAndAccept(fx)
    // The registry root rejects the unknown probe message, so it bounces back to the entry.
    await requestSetPool(fx, fx.administrator, fx.registry.address)

    const result = await getTokenInfo()
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toBeNull()
  })

  it('returns the transfer initiator reported by the pool', async () => {
    await registerAndAccept(fx)
    const initiator = fx.other.address
    await setPool(fx, fx.administrator, fx.pool, 0n, undefined, initiator)

    const result = await getTokenInfo()
    const info = returnedTokenInfo(fx, result, fx.other.address)
    expect(info.tokenPool).toEqualAddress(fx.pool)
    expect(info.transferInitiator).toEqualAddress(initiator)
  })

  it('returns no transfer initiator for a delisted token even if the pool reported one', async () => {
    await registerAndAccept(fx)
    await setPool(fx, fx.administrator, fx.pool, 0n, undefined, fx.other.address)
    await setPool(fx, fx.administrator, null)

    const result = await getTokenInfo()
    const info = returnedTokenInfo(fx, result, fx.other.address)
    expect(info.tokenPool).toBeNull()
    expect(info.transferInitiator).toBeNull()
  })

  it('relays resolved token info from the deterministic entry', async () => {
    const result = await fx.registry.sendTokenAdminRegistryEntryTokenInfo(
      asEntry(fx),
      toNano('0.05'),
      { queryId: 3n, token: fx.token, requester: fx.other.address, tokenInfo: tokenInfo(fx) },
    )
    expect(returnedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_TokenInfo.create({
        queryId: 3n,
        token: fx.token,
        minterAddress: fx.token,
        tokenPool: fx.pool,
        transferInitiator: null,
        version: 1n,
      }),
    )
  })

  it('rejects resolved token info not sent by the entry of that token', async () => {
    await registerToken(fx)
    const forged = {
      token: fx.token,
      requester: fx.other.address,
      tokenInfo: tokenInfo(fx, fx.replacementPool),
    }

    const fromAccount = await fx.registry.sendTokenAdminRegistryEntryTokenInfo(
      fx.other.getSender(),
      toNano('0.1'),
      forged,
    )
    expectRootFailure(
      fx,
      fromAccount,
      fx.other.address,
      RegistryErrors['TokenAdminRegistry_Error.UnauthorizedEntry'],
    )

    const fromOtherEntry = await fx.registry.sendTokenAdminRegistryEntryTokenInfo(
      asEntry(fx, fx.otherToken),
      toNano('0.1'),
      forged,
    )
    expectRootFailure(
      fx,
      fromOtherEntry,
      entryAddress(fx, fx.otherToken),
      RegistryErrors['TokenAdminRegistry_Error.UnauthorizedEntry'],
    )
  })

  it('rejects root-only entry reads from other senders', async () => {
    await registerToken(fx)
    const result = await entryFor(fx).sendTokenAdminRegistryEntryMessageFromRoot(
      fx.other.getSender(),
      toNano('0.1'),
      messageFromRoot(
        tare.TokenAdminRegistryEntry_GetTokenInfo.create({
          token: fx.token,
          requester: fx.other.address,
        }),
      ),
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entryAddress(fx),
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_get_token_info',
        await coverageConfig(),
      )
    }
  })
})
