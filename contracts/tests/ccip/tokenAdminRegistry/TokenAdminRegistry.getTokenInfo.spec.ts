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
      op: tar.TokenAdminRegistry_TokenInfoResolved.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: fx.other.address,
      op: tar.TokenAdminRegistry_ReturnTokenInfo.PREFIX,
    })
    expect(returnedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_ReturnTokenInfo.create({
        queryId: 106n,
        token: fx.token,
        minterAddress: fx.token,
        tokenPool: fx.pool,
        version: 1n,
      }),
    )
  })

  it('returns no pool for a delisted token', async () => {
    await registerAndAccept(fx)
    await setPool(fx, fx.administrator, null)

    const result = await getTokenInfo()
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toBeNull()
  })

  it('relays resolved token info from the deterministic entry', async () => {
    const result = await fx.registry.sendTokenAdminRegistryTokenInfoResolved(
      asEntry(fx),
      toNano('0.05'),
      { queryId: 3n, token: fx.token, requester: fx.other.address, tokenInfo: tokenInfo(fx) },
    )
    expect(returnedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_ReturnTokenInfo.create({
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

    const fromAccount = await fx.registry.sendTokenAdminRegistryTokenInfoResolved(
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

    const fromOtherEntry = await fx.registry.sendTokenAdminRegistryTokenInfoResolved(
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
        tare.TokenAdminRegistryEntry_ResolveTokenInfo.create({ requester: fx.other.address }),
      ),
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entryAddress(fx),
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })
  })

  it('answers public reads directly from the entry', async () => {
    await registerAndAccept(fx)
    await setPool(fx, fx.administrator, null)
    const entry = entryFor(fx)

    const result = await entry.sendTokenAdminRegistryEntryGetTokenInfo(
      fx.other.getSender(),
      toNano('0.05'),
      { queryId: 105n },
    )
    const reply = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(entry.address) &&
        tx.inMessage.info.dest.equals(fx.other.address),
    )
    if (!reply?.inMessage) {
      throw new Error('TokenAdminRegistryEntry token info reply not found')
    }
    expect(
      tare.TokenAdminRegistryEntry_ReturnTokenInfo.fromSlice(reply.inMessage.body.beginParse()),
    ).toEqual(
      tare.TokenAdminRegistryEntry_ReturnTokenInfo.create({
        queryId: 105n,
        minterAddress: fx.token,
        tokenPool: null,
        version: 1n,
      }),
    )
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
