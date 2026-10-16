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
  failedTokenInfo,
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
    blockchain.now = 1
    entryCode = await contractCode.ccip.local('TokenAdminRegistryEntry')
    targetCode = await contractCode.ccip.local('TokenAdminRegistryEntryUpgradeTarget')
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
    await registerToken(fx)
  })

  const resolveTokenInfo = (minEntryVersion: bigint) =>
    messageFromRoot(
      tare.TokenAdminRegistryEntry_GetTokenInfo.create({
        token: fx.token,
        requester: fx.other.address,
      }),
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

  const fromRootToEntry = (result: { transactions: any[] }, op: number) =>
    result.transactions.filter(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(fx.registry.address) &&
        tx.inMessage.info.dest.equals(entryAddress(fx)) &&
        tx.inMessage.body.beginParse().preloadUint(32) === op,
    )

  it('upgrades to the delivered code, migrates its storage and resumes the request on it', async () => {
    const entry = entryFor(fx)
    const storageBefore = (await accountState(fx)).data
    const request = resolveTokenInfo(ENTRY_VERSION)

    const upgrade = await entry.sendUpgradeableUpgrade(asRoot(fx), toNano('0.1'), {
      code: targetCode,
    })
    expect(upgrade.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      op: tare.Upgradeable_Upgrade.PREFIX,
      success: true,
    })
    expect(entryEmittedExternal(upgrade)).toBe(true)
    expect((await accountState(fx)).code).toEqualCell(targetCode)

    const upgraded = blockchain.openContract(
      target.TokenAdminRegistryEntryUpgradeTarget.fromAddress(entry.address),
    )
    expect(await upgraded.getPreviousStorage()).toEqualCell(storageBefore)
    expect(await upgraded.getResumed()).toBeNull()

    const resume = await entry.sendTokenAdminRegistryEntryResume(asRoot(fx), toNano('0.1'), {
      request,
    })
    expect(resume.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: true,
    })
    expect(await upgraded.getResumed()).toEqual(request)
  })

  it('answers an upgrade request with an Upgradeable_Upgrade followed by the request as a Resume', async () => {
    const before = await accountState(fx)
    const rootBalanceBefore = (await blockchain.getContract(fx.registry.address)).balance
    const request = resolveTokenInfo(ENTRY_VERSION)
    const result = await fx.registry.sendTokenAdminRegistryEntryUpgradeRequest(
      asEntry(fx),
      toNano('0.1'),
      { queryId: 21n, token: fx.token, request },
    )

    const rootTx = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.body.beginParse().preloadUint(32) ===
          tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
    )
    if (!rootTx) {
      throw new Error('EntryUpgradeRequest transaction not found')
    }
    const [upgradeMsg, resumeMsg] = rootTx.outMessages.values()
    const upgrade = tare.Upgradeable_Upgrade.fromSlice(upgradeMsg.body.beginParse())
    expect(upgrade.queryId).toBe(21n)
    expect(upgrade.code).toEqualCell(entryCode)
    expect(
      tare.TokenAdminRegistryEntry_Resume.fromSlice(resumeMsg.body.beginParse()).request,
    ).toEqual(request)

    const [upgradeTx] = fromRootToEntry(result, tare.Upgradeable_Upgrade.PREFIX)
    const [resumeTx] = fromRootToEntry(result, tare.TokenAdminRegistryEntry_Resume.PREFIX)
    expect(upgradeTx.description.type === 'generic' && !upgradeTx.description.aborted).toBe(true)
    expect(upgradeTx.lt < resumeTx.lt).toBe(true)

    // The entry already runs the root entry code, so it skips the reinstall.
    expect(entryEmittedExternal(result)).toBe(false)
    expect(returnedTokenInfo(fx, result, fx.other.address).tokenPool).toEqualAddress(fx.pool)
    expect(await accountState(fx)).toEqual(before)
    // The Upgrade is funded from the request's value, not from the root balance.
    expect((await blockchain.getContract(fx.registry.address)).balance).toBe(rootBalanceBefore)
  })

  it('reports a request to the requester when the root has no code satisfying it, without looping', async () => {
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
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.VersionUnavailable'],
    })
    expect(result.transactions).toHaveTransaction({
      from: entry.address,
      to: fx.registry.address,
      inMessageBounced: true,
      success: true,
    })
    expect(failedTokenInfo(fx, result, fx.other.address)).toEqual(
      tar.TokenAdminRegistry_GetTokenInfoFailed.create({ queryId: 9n, token: fx.token }),
    )
    expect(
      result.transactions.filter(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src.equals(entry.address) &&
          tx.inMessage.info.dest.equals(fx.registry.address) &&
          tx.inMessage.body.beginParse().preloadUint(32) ===
            tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
      ),
    ).toHaveLength(1)
    expect((await accountState(fx)).code).toEqualCell(entryCode)
  })

  it('keeps its code when an upgrade fails and does not defer the following Resume', async () => {
    const entry = entryFor(fx)
    const rootCode = await contractCode.ccip.local('TokenAdminRegistry')

    const upgrade = await entry.sendUpgradeableUpgrade(asRoot(fx), toNano('0.1'), {
      code: rootCode,
    })
    expect(upgrade.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      success: false,
      exitCode: EntryErrors['Upgradeable_Error.VersionMismatch'],
    })
    expect((await accountState(fx)).code).toEqualCell(entryCode)

    const resume = await entry.sendTokenAdminRegistryEntryResume(asRoot(fx), toNano('0.1'), {
      request: resolveTokenInfo(ENTRY_VERSION + 1n),
    })
    expect(resume.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.VersionUnavailable'],
    })
    expect(resume.transactions).not.toHaveTransaction({
      op: tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
    })
  })

  it('lets anyone push the root entry code to an entry', async () => {
    const underfunded = await fx.registry.sendTokenAdminRegistryUpgradeEntry(
      fx.other.getSender(),
      toNano('0.005'),
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
      op: tare.Upgradeable_Upgrade.PREFIX,
      success: true,
    })
    expect(result.transactions).not.toHaveTransaction({
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
    })
    expect((await accountState(fx)).code).toEqualCell(entryCode)
  })

  it('ignores the bounce of an upgrade pushed to an unregistered token', async () => {
    const result = await fx.registry.sendTokenAdminRegistryUpgradeEntry(
      fx.other.getSender(),
      toNano('0.1'),
      { tokenAddress: fx.otherToken },
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx, fx.otherToken),
      op: tare.Upgradeable_Upgrade.PREFIX,
      aborted: true,
    })
    const bounce = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.bounced &&
        tx.inMessage.info.dest.equals(fx.registry.address),
    )
    if (!bounce) {
      throw new Error('Upgrade bounce not found')
    }
    expect(bounce.description.type === 'generic' && !bounce.description.aborted).toBe(true)
    expect(bounce.outMessages.size).toBe(0)
  })

  it('rejects upgrade and resume messages from untrusted senders', async () => {
    const entry = entryFor(fx)
    const request = messageFromRoot(
      tare.TokenAdminRegistryEntry_SetPool.create({
        actor: fx.other.address,
        tokenPool: fx.replacementPool,
      }),
    )

    const upgrade = await entry.sendUpgradeableUpgrade(fx.other.getSender(), toNano('0.1'), {
      code: targetCode,
    })
    expect(upgrade.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entry.address,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    for (const sender of [fx.other.getSender(), asEntry(fx)]) {
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
