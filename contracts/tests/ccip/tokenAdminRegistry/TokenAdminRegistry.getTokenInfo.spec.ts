import '@ton/test-utils'

import { toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import {
  EntryErrors,
  Fixture,
  RegistryErrors,
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

  const getTokenInfo = (queryId = 0n) =>
    fx.registry.sendTokenAdminRegistryGetTokenInfo(fx.other.getSender(), toNano('0.1'), {
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

  it('returns no pool for a delisted token', async () => {
    await registerAndAccept(fx)
    await setPool(fx, fx.administrator, null)

    const result = await getTokenInfo()
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toBeNull()
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
