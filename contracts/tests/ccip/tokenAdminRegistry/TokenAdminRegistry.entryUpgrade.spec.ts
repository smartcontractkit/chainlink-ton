import '@ton/test-utils'

import { Cell, Message, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import * as target from '../../../wrappers/gen/test/TokenAdminRegistryEntryUpgradeTarget'
import { ENTRY_VERSION } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  EntryErrors,
  Fixture,
  RegistryErrors,
  accountState,
  asEntry,
  asRoot,
  coverageConfig,
  createBlockchain,
  entryAddress,
  entryFor,
  expectRootFailure,
  messageFromRoot,
  registerToken,
  returnedTokenInfo,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - Entry Upgrades', () => {
  let blockchain: Blockchain
  let fx: Fixture
  let entryCode: Cell
  let targetCode: Cell

  beforeAll(async () => {
    blockchain = await createBlockchain()
    entryCode = await contractCode.ccip.local('TokenAdminRegistryEntry')
    targetCode = await contractCode.ccip.local('TokenAdminRegistryEntryUpgradeTarget')
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
    await registerToken(fx)
  })

  const resolveTokenInfo = (minEntryVersion: bigint) =>
    messageFromRoot(
      tare.TokenAdminRegistryEntry_ResolveTokenInfo.create({ requester: fx.other.address }),
      minEntryVersion,
      9n,
    )

  const entryEmittedExternal = (result: { transactions: any[] }) =>
    result.transactions.some(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.dest.equals(entryAddress(fx)) &&
        tx.outMessages.values().some((msg: Message) => msg.info.type === 'external-out'),
    )

  it('upgrades to the delivered code, migrates its storage and resumes the request on it', async () => {
    const entry = entryFor(fx)
    const storageBefore = (await accountState(fx)).data
    const request = resolveTokenInfo(ENTRY_VERSION)

    const result = await entry.sendTokenAdminRegistryEntryUpgradeAndResume(
      asRoot(fx),
      toNano('0.1'),
      { code: targetCode, request },
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_UpgradeAndResume.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: entry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: true,
    })
    expect(entryEmittedExternal(result)).toBe(true)

    expect((await accountState(fx)).code).toEqualCell(targetCode)
    const upgraded = blockchain.openContract(
      target.TokenAdminRegistryEntryUpgradeTarget.fromAddress(entry.address),
    )
    expect(await upgraded.getPreviousStorage()).toEqualCell(storageBefore)
    expect(await upgraded.getResumed()).toEqual(request)
  })

  it('upgrades without resuming when no request is pending', async () => {
    const entry = entryFor(fx)
    const storageBefore = (await accountState(fx)).data

    const result = await entry.sendTokenAdminRegistryEntryUpgradeAndResume(
      asRoot(fx),
      toNano('0.1'),
      { code: targetCode, request: null },
    )
    expect(result.transactions).not.toHaveTransaction({
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
    })

    expect((await accountState(fx)).code).toEqualCell(targetCode)
    const upgraded = blockchain.openContract(
      target.TokenAdminRegistryEntryUpgradeTarget.fromAddress(entry.address),
    )
    expect(await upgraded.getPreviousStorage()).toEqualCell(storageBefore)
    expect(await upgraded.getResumed()).toBeNull()
  })

  it('resumes a pending request without reinstalling identical code', async () => {
    const entry = entryFor(fx)
    const before = await accountState(fx)

    const result = await entry.sendTokenAdminRegistryEntryUpgradeAndResume(
      asRoot(fx),
      toNano('0.1'),
      { code: entryCode, request: resolveTokenInfo(ENTRY_VERSION) },
    )
    expect(result.transactions).toHaveTransaction({
      from: entry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: true,
    })
    expect(entryEmittedExternal(result)).toBe(false)
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toEqualAddress(fx.pool)
    expect(await accountState(fx)).toEqual(before)
  })

  it('defers a request it cannot satisfy and does not loop when the root has no newer code', async () => {
    const entry = entryFor(fx)

    const result = await entry.sendTokenAdminRegistryEntryMessageFromRoot(
      asRoot(fx),
      toNano('0.1'),
      resolveTokenInfo(ENTRY_VERSION + 1n),
    )
    expect(result.transactions).toHaveTransaction({
      from: entry.address,
      to: fx.registry.address,
      op: tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_UpgradeAndResume.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: entry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.VersionUnavailable'],
    })
    expect(
      result.transactions.filter(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src.equals(entry.address) &&
          tx.inMessage.info.dest.equals(fx.registry.address),
      ),
    ).toHaveLength(1)
    expect((await accountState(fx)).code).toEqualCell(entryCode)
  })

  it('answers an upgrade request from the entry with the root entry code and the request', async () => {
    const request = resolveTokenInfo(ENTRY_VERSION)
    const result = await fx.registry.sendTokenAdminRegistryEntryUpgradeRequest(
      asEntry(fx),
      toNano('0.1'),
      { queryId: 21n, token: fx.token, request },
    )
    const upgrade = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(fx.registry.address) &&
        tx.inMessage.info.dest.equals(entryAddress(fx)),
    )
    if (!upgrade?.inMessage) {
      throw new Error('UpgradeAndResume not found')
    }
    const body = tare.TokenAdminRegistryEntry_UpgradeAndResume.fromSlice(
      upgrade.inMessage.body.beginParse(),
    )
    expect(body.queryId).toBe(21n)
    expect(body.code).toEqualCell(entryCode)
    expect(body.request).toEqual(request)
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toEqualAddress(fx.pool)
  })

  it('lets anyone push the root entry code to an entry', async () => {
    const underfunded = await fx.registry.sendTokenAdminRegistryUpgradeEntry(
      fx.other.getSender(),
      toNano('0.01'),
      { tokenAddress: fx.token },
    )
    expectRootFailure(
      fx,
      underfunded,
      fx.other.address,
      RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
    )

    const result = await fx.registry.sendTokenAdminRegistryUpgradeEntry(
      fx.other.getSender(),
      toNano('0.1'),
      { tokenAddress: fx.token },
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      op: tare.TokenAdminRegistryEntry_UpgradeAndResume.PREFIX,
      success: true,
    })
    expect(result.transactions).not.toHaveTransaction({
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
    })
    expect((await accountState(fx)).code).toEqualCell(entryCode)
  })

  it('rejects upgrade and resume messages from untrusted senders', async () => {
    const entry = entryFor(fx)
    const request = messageFromRoot(
      tare.TokenAdminRegistryEntry_SetPool.create({
        actor: fx.other.address,
        tokenPool: fx.replacementPool,
      }),
    )

    const upgrade = await entry.sendTokenAdminRegistryEntryUpgradeAndResume(
      fx.other.getSender(),
      toNano('0.1'),
      { code: targetCode, request: null },
    )
    expect(upgrade.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entry.address,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    for (const sender of [fx.other.getSender(), asRoot(fx)]) {
      const resume = await entry.sendTokenAdminRegistryEntryResume(sender, toNano('0.1'), {
        request,
      })
      expect(resume.transactions).toHaveTransaction({
        to: entry.address,
        success: false,
        exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
      })
    }

    for (const [sender, from] of [
      [fx.other.getSender(), fx.other.address],
      [asEntry(fx, fx.otherToken), entryAddress(fx, fx.otherToken)],
    ] as const) {
      const upgradeRequest = await fx.registry.sendTokenAdminRegistryEntryUpgradeRequest(
        sender,
        toNano('0.1'),
        { token: fx.token, request },
      )
      expectRootFailure(
        fx,
        upgradeRequest,
        from,
        RegistryErrors['TokenAdminRegistry_Error.UnauthorizedEntry'],
      )
    }

    expect((await accountState(fx)).code).toEqualCell(entryCode)
    expect(await entry.getTokenInfo()).toEqual(tokenInfo(fx))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_entry_upgrade',
        await coverageConfig(),
      )
    }
  })
})
