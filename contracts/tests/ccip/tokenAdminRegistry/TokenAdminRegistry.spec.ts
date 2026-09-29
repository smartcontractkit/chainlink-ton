import { Address, Cell, Message, beginCell, internal, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract, createShardAccount } from '@ton/sandbox'
import '@ton/test-utils'

import { contractCode } from '../../../wrappers/codeLoader'
import * as namespace from '../../../wrappers/ccip/NameSpace'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

describe('TokenAdminRegistry', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let other: SandboxContract<TreasuryContract>
  let administrator: SandboxContract<TreasuryContract>
  let replacementAdministrator: SandboxContract<TreasuryContract>
  let token: Address
  let pool: Address
  let replacementPool: Address
  let deployableCode: Cell
  let registry: SandboxContract<tar.TokenAdminRegistry>
  let nextRegistryId = 0n

  const tokenInfo = (tokenPool: Address | null = pool) =>
    tar.TokenRegistry_TokenInfo.create({
      tokenPool,
      minterAddress: token,
      version: 1n,
    })

  const entryFor = (tokenAddress = token) =>
    blockchain.openContract(
      tare.TokenAdminRegistryEntry.fromAddress(
        namespace.deriveAddress(
          registry.address,
          namespace.CCIPNamespace.TokenRegistry,
          beginCell().storeAddress(tokenAddress),
          deployableCode,
        ),
      ),
    )

  const externalEvent = (result: { transactions: any[] }) => {
    const rootTransaction = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.dest.equals(registry.address) &&
        tx.outMessages.values().some((msg: Message) => msg.info.type === 'external-out'),
    )
    if (!rootTransaction) {
      throw new Error('TokenAdminRegistry event transaction not found')
    }

    const event = rootTransaction.outMessages
      .values()
      .find((msg: Message) => msg.info.type === 'external-out')
    if (!event) {
      throw new Error('TokenAdminRegistry external event not found')
    }
    return event.body.beginParse()
  }

  const register = async (proposedAdministrator = administrator.address, queryId = 0n) => {
    const result = await registry.sendTokenAdminRegistryRegisterToken(
      owner.getSender(),
      toNano('0.1'),
      {
        queryId,
        tokenAddress: token,
        tokenInfo: tokenInfo(),
        administrator: proposedAdministrator,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      success: true,
      op: tar.TokenAdminRegistry_RegisterToken.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      to: entryFor().address,
      deploy: true,
      success: true,
    })
    return result
  }

  const transferAdminRole = (
    actor: SandboxContract<TreasuryContract>,
    newAdministrator: Address | null,
    queryId = 0n,
  ) =>
    registry.sendTokenAdminRegistryTransferAdminRole(actor.getSender(), toNano('0.1'), {
      queryId,
      tokenAddress: token,
      newAdministrator,
    })

  const acceptAdminRole = (actor: SandboxContract<TreasuryContract>, queryId = 0n) =>
    registry.sendTokenAdminRegistryAcceptAdminRole(actor.getSender(), toNano('0.1'), {
      queryId,
      tokenAddress: token,
    })

  const setPool = (
    actor: SandboxContract<TreasuryContract>,
    tokenPool: Address | null,
    queryId = 0n,
  ) =>
    registry.sendTokenAdminRegistrySetPool(actor.getSender(), toNano('0.1'), {
      queryId,
      tokenAddress: token,
      tokenPool,
    })

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployableCode = await contractCode.ccip.local('Deployable')
  })

  beforeEach(async () => {
    owner = await blockchain.treasury('owner')
    other = await blockchain.treasury('other')
    administrator = await blockchain.treasury('administrator')
    replacementAdministrator = await blockchain.treasury('replacementAdministrator')
    token = (await blockchain.treasury(`token-${Math.random()}`)).address
    pool = (await blockchain.treasury(`pool-${Math.random()}`)).address
    replacementPool = (await blockchain.treasury(`replacement-pool-${Math.random()}`)).address

    registry = blockchain.openContract(
      tar.TokenAdminRegistry.fromStorage(
        {
          // Registry addresses include storage in their StateInit. Keep every
          // test registry distinct while reusing the same sandbox accounts.
          id: ++nextRegistryId,
          ownable: tar.Ownable2Step.create({ owner: owner.address }),
        },
        { overrideContractCode: await contractCode.ccip.local('TokenAdminRegistry') },
      ),
    )

    const deployment = await registry.sendDeploy(owner.getSender(), toNano('0.1'))
    expect(deployment.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      deploy: true,
      success: true,
    })
  })

  it('reports its type and version', async () => {
    const [type, version] = await registry.getTypeAndVersion()
    expect(type.loadStringTail()).toBe('link.chain.ton.ccip.TokenAdminRegistry')
    expect(version.loadStringTail()).toBe('1.6.0')
  })

  it('transfers root ownership in two steps before changing owner permissions', async () => {
    const proposal = await registry.sendOwnable2StepTransferOwnership(
      owner.getSender(),
      toNano('0.05'),
      {
        newOwner: other.address,
      },
    )
    expect(proposal.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      success: true,
    })

    const acceptance = await registry.sendOwnable2StepAcceptOwnership(
      other.getSender(),
      toNano('0.05'),
      {},
    )
    expect(acceptance.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: true,
    })

    const oldOwnerUpdate = await registry.sendTokenAdminRegistryRegisterToken(
      owner.getSender(),
      toNano('0.05'),
      {
        tokenAddress: token,
        tokenInfo: tokenInfo(),
        administrator: administrator.address,
      },
    )
    expect(oldOwnerUpdate.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    const newOwnerUpdate = await registry.sendTokenAdminRegistryRegisterToken(
      other.getSender(),
      toNano('0.05'),
      {
        tokenAddress: token,
        tokenInfo: tokenInfo(),
        administrator: administrator.address,
      },
    )
    expect(newOwnerUpdate.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: true,
    })
  })

  it('registers a token at its deterministic entry address and relays the proposal event', async () => {
    const result = await register(administrator.address, 101n)
    const entry = entryFor()

    const config = await entry.getTokenAdminRegistryConfig()
    expect(config.tokenAdminRegistry).toEqual(registry.address)
    expect(config.administrator).toBeNull()
    expect(config.pendingAdministrator).toEqual(administrator.address)
    expect(await entry.getTokenInfo()).toEqual(tokenInfo())

    const event = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
      externalEvent(result),
    )
    expect(event.token).toEqual(token)
    expect(event.queryId).toEqual(101n)
    expect(event.currentAdministrator).toBeNull()
    expect(event.newAdministrator).toEqual(administrator.address)
  })

  it('rejects registration by non-owners', async () => {
    const nonOwnerResult = await registry.sendTokenAdminRegistryRegisterToken(
      other.getSender(),
      toNano('0.1'),
      { tokenAddress: token, tokenInfo: tokenInfo(), administrator: administrator.address },
    )
    expect(nonOwnerResult.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })
  })

  it('makes registration create-only and leaves an existing entry unchanged on retry', async () => {
    await register()
    const entry = entryFor()
    const before = await entry.getTokenAdminRegistryConfig()

    const retry = await registry.sendTokenAdminRegistryRegisterToken(
      owner.getSender(),
      toNano('0.1'),
      {
        tokenAddress: token,
        tokenInfo: tokenInfo(replacementPool),
        administrator: replacementAdministrator.address,
      },
    )
    expect(retry.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
    })
    expect(await entry.getTokenAdminRegistryConfig()).toEqual(before)
    expect(await entry.getTokenInfo()).toEqual(tokenInfo())
  })

  it('allows the root owner to replace an unaccepted administrator proposal', async () => {
    await register()
    const result = await registry.sendTokenAdminRegistryOverridePendingAdministrator(
      owner.getSender(),
      toNano('0.1'),
      { tokenAddress: token, administrator: replacementAdministrator.address },
    )

    expect(await entryFor().getTokenAdminRegistryConfig()).toEqual(
      tare.TokenRegistry_AdminConfig.create({
        tokenAdminRegistry: registry.address,
        administrator: null,
        pendingAdministrator: replacementAdministrator.address,
      }),
    )
    const event = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
      externalEvent(result),
    )
    expect(event.currentAdministrator).toBeNull()
    expect(event.newAdministrator).toEqual(replacementAdministrator.address)
  })

  it('keeps administrator transfer two-step and relays lifecycle events through the root', async () => {
    await register()
    const entry = entryFor()

    const invalidAcceptance = await acceptAdminRole(other)
    expect(invalidAcceptance.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode:
        tare.TokenAdminRegistryEntry.Errors[
          'TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'
        ],
    })

    const acceptance = await acceptAdminRole(administrator, 102n)
    expect(
      tar.TokenAdminRegistry_AdministratorTransferred.fromSlice(externalEvent(acceptance)),
    ).toEqual(
      tar.TokenAdminRegistry_AdministratorTransferred.create({
        queryId: 102n,
        token,
        newAdministrator: administrator.address,
      }),
    )

    const unauthorizedTransfer = await transferAdminRole(other, replacementAdministrator.address)
    expect(unauthorizedTransfer.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const transfer = await transferAdminRole(administrator, replacementAdministrator.address, 103n)
    const transferEvent = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
      externalEvent(transfer),
    )
    expect(transferEvent.queryId).toEqual(103n)
    expect(transferEvent.currentAdministrator).toEqual(administrator.address)
    expect(transferEvent.newAdministrator).toEqual(replacementAdministrator.address)

    await acceptAdminRole(replacementAdministrator)
    const config = await entry.getTokenAdminRegistryConfig()
    expect(config.administrator).toEqual(replacementAdministrator.address)
    expect(config.pendingAdministrator).toBeNull()

    const overrideAfterAcceptance =
      await registry.sendTokenAdminRegistryOverridePendingAdministrator(
        owner.getSender(),
        toNano('0.1'),
        { tokenAddress: token, administrator: administrator.address },
      )
    expect(overrideAfterAcceptance.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode:
        tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.AlreadyRegistered'],
    })
  })

  it('rejects direct entry lifecycle calls even when they claim a valid actor', async () => {
    await register()
    const entry = entryFor()

    const directAcceptance = await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      { minEntryVersion: 1n, actor: administrator.address },
    )
    expect(directAcceptance.transactions).toHaveTransaction({
      from: administrator.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const accepted = await acceptAdminRole(administrator)
    expect(accepted.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: true,
    })
  })

  it('keeps permissions with the active administrator until a transfer is accepted', async () => {
    await register()
    const entry = entryFor()
    await acceptAdminRole(administrator)
    await transferAdminRole(administrator, replacementAdministrator.address)

    const pendingAdminUpdate = await setPool(replacementAdministrator, replacementPool)
    expect(pendingAdminUpdate.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const currentAdminUpdate = await setPool(administrator, replacementPool)
    expect(currentAdminUpdate.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: true,
    })

    await acceptAdminRole(replacementAdministrator)
    const formerAdminUpdate = await setPool(administrator, pool)
    expect(formerAdminUpdate.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })
  })

  it('allows the active administrator to cancel a pending transfer', async () => {
    await register()
    const entry = entryFor()
    await acceptAdminRole(administrator)
    await transferAdminRole(administrator, replacementAdministrator.address)

    const cancellation = await transferAdminRole(administrator, null)
    const event = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
      externalEvent(cancellation),
    )
    expect(event.currentAdministrator).toEqual(administrator.address)
    expect(event.newAdministrator).toBeNull()

    const config = await entry.getTokenAdminRegistryConfig()
    expect(config.administrator).toEqual(administrator.address)
    expect(config.pendingAdministrator).toBeNull()
  })

  it('updates pools only through the active administrator and emits changes from the root', async () => {
    await register()
    const entry = entryFor()
    await acceptAdminRole(administrator)

    const unauthorized = await setPool(other, replacementPool)
    expect(unauthorized.transactions).toHaveTransaction({
      from: registry.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const update = await setPool(administrator, replacementPool, 104n)
    expect(await entry.getTokenInfo()).toEqual(tokenInfo(replacementPool))
    const event = tar.TokenAdminRegistry_PoolSet.fromSlice(externalEvent(update))
    expect(event).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        queryId: 104n,
        token,
        previousPool: pool,
        newPool: replacementPool,
      }),
    )

    const noOp = await setPool(administrator, replacementPool)
    expect(noOp.transactions).not.toHaveTransaction({ from: entry.address, to: registry.address })
  })

  const returnedTokenInfo = (result: { transactions: any[] }, requester: Address) => {
    const reply = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(registry.address) &&
        tx.inMessage.info.dest.equals(requester),
    )
    if (!reply?.inMessage) {
      throw new Error('TokenAdminRegistry token info reply not found')
    }
    return tar.TokenAdminRegistry_ReturnTokenInfo.fromSlice(reply.inMessage.body.beginParse())
  }

  it('resolves token info through the root for CCIP reads', async () => {
    await register()
    const result = await registry.sendTokenAdminRegistryGetTokenInfo(
      other.getSender(),
      toNano('0.1'),
      { queryId: 106n, token },
    )
    expect(result.transactions).toHaveTransaction({
      from: registry.address,
      to: entryFor().address,
      op: tare.TokenAdminRegistryEntry_ResolveTokenInfo.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: entryFor().address,
      to: registry.address,
      op: tar.TokenAdminRegistry_TokenInfoResolved.PREFIX,
      success: true,
    })
    expect(returnedTokenInfo(result, other.address)).toEqual(
      tar.TokenAdminRegistry_ReturnTokenInfo.create({
        queryId: 106n,
        token,
        minterAddress: token,
        tokenPool: pool,
        version: 1n,
      }),
    )
  })

  it('rejects resolved token info not sent by the deterministic entry', async () => {
    await register()
    const forged = await registry.sendTokenAdminRegistryTokenInfoResolved(
      other.getSender(),
      toNano('0.1'),
      { token, requester: other.address, tokenInfo: tokenInfo(replacementPool) },
    )
    expect(forged.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: false,
      exitCode: tar.TokenAdminRegistry.Errors['TokenAdminRegistry_Error.UnauthorizedEntry'],
    })
  })

  it('rejects root-only entry reads from other senders', async () => {
    await register()
    const direct = await entryFor().sendTokenAdminRegistryEntryResolveTokenInfo(
      other.getSender(),
      toNano('0.1'),
      { minEntryVersion: 1n, requester: other.address },
    )
    expect(direct.transactions).toHaveTransaction({
      from: other.address,
      to: entryFor().address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })
  })

  it('returns no pool for delisted entries through the public entry read', async () => {
    await register()
    const entry = entryFor()
    await acceptAdminRole(administrator)
    await setPool(administrator, null)

    const query = await entry.sendTokenAdminRegistryEntryGetTokenInfo(
      other.getSender(),
      toNano('0.05'),
      { queryId: 105n },
    )
    expect(query.transactions).toHaveTransaction({
      from: entry.address,
      to: other.address,
      success: true,
      op: tare.TokenAdminRegistryEntry_ReturnTokenInfo.PREFIX,
    })
    const responseTransaction = query.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(entry.address) &&
        tx.inMessage.info.dest.equals(other.address),
    )
    if (!responseTransaction?.inMessage) {
      throw new Error('TokenAdminRegistryEntry lookup response not found')
    }
    const response = tare.TokenAdminRegistryEntry_ReturnTokenInfo.fromSlice(
      responseTransaction.inMessage.body.beginParse(),
    )
    expect(response).toEqual(
      tare.TokenAdminRegistryEntry_ReturnTokenInfo.create({
        queryId: 105n,
        minterAddress: token,
        tokenPool: null,
        version: 1n,
      }),
    )
  })

  it('rejects lifecycle notifications not sent by the deterministic entry', async () => {
    const result = await registry.sendTokenAdminRegistryAdministratorTransferred(
      other.getSender(),
      toNano('0.05'),
      { token, newAdministrator: administrator.address },
    )
    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: false,
      exitCode: tar.TokenAdminRegistry.Errors['TokenAdminRegistry_Error.UnauthorizedEntry'],
    })
  })
  describe('upgrades', () => {
    let entryCode: Cell
    let staleEntryCode: Cell

    beforeAll(async () => {
      entryCode = await contractCode.ccip.local('TokenAdminRegistryEntry')
      staleEntryCode = await contractCode.ccip.local('TokenAdminRegistryEntryV0')
    })

    // Replaces the entry code with a build reporting an older entry version
    // while keeping its storage, as if it had been deployed by an older root.
    const makeStale = async (address = entryFor().address) => {
      const contract = await blockchain.getContract(address)
      const state = contract.accountState
      if (state?.type !== 'active' || !state.state.data) {
        throw new Error('entry is not active')
      }
      await blockchain.setShardAccount(
        address,
        createShardAccount({
          address,
          code: staleEntryCode,
          data: state.state.data,
          balance: contract.balance,
        }),
      )
      expect(await entryCode_(address)).toEqual(staleEntryCode)
    }

    const entryCode_ = async (address = entryFor().address) => {
      const state = (await blockchain.getContract(address)).accountState
      if (state?.type !== 'active' || !state.state.code) {
        throw new Error('entry is not active')
      }
      return state.state.code
    }

    const expectSelfHealed = (result: { transactions: any[] }, entry = entryFor().address) => {
      expect(result.transactions).toHaveTransaction({
        from: entry,
        to: registry.address,
        op: tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: registry.address,
        to: entry,
        op: tare.TokenAdminRegistryEntry_UpgradeAndResume.PREFIX,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: entry,
        to: entry,
        op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
        success: true,
      })
    }

    const getTokenInfo = (sender: SandboxContract<TreasuryContract>, value = toNano('0.1')) =>
      registry.sendTokenAdminRegistryGetTokenInfo(sender.getSender(), value, {
        queryId: 7n,
        token,
      })

    it('deploys entries with the root entry code at the current version', async () => {
      await register()
      expect(await entryCode_()).toEqual(entryCode)
      expect(await entryFor().getEntryVersion()).toEqual(1n)
    })

    it('upgrades the root only through its owner and preserves its state', async () => {
      const rootCode = await contractCode.ccip.local('TokenAdminRegistry')
      const unauthorized = await registry.sendUpgradeableUpgrade(other.getSender(), toNano('0.1'), {
        code: rootCode,
      })
      expect(unauthorized.transactions).toHaveTransaction({
        from: other.address,
        to: registry.address,
        success: false,
        exitCode: ownable2step.Errors.OnlyCallableByOwner,
      })

      const upgrade = await registry.sendUpgradeableUpgrade(owner.getSender(), toNano('0.1'), {
        code: rootCode,
      })
      expect(upgrade.transactions).toHaveTransaction({
        from: owner.address,
        to: registry.address,
        success: true,
      })
      expect(await registry.getOwner()).toEqual(owner.address)
    })

    it('upgrades a stale entry before answering a token info query', async () => {
      await register()
      await makeStale()

      const result = await getTokenInfo(other)
      expectSelfHealed(result)
      expect(await entryCode_()).toEqual(entryCode)
      expect(await entryFor().getTokenInfo()).toEqual(tokenInfo())
      expect(returnedTokenInfo(result, other.address).tokenPool).toEqual(pool)
    })

    it('upgrades a stale entry before applying each administrative operation', async () => {
      await register()
      const entry = entryFor()

      await makeStale()
      const override = await registry.sendTokenAdminRegistryOverridePendingAdministrator(
        owner.getSender(),
        toNano('0.1'),
        { tokenAddress: token, administrator: administrator.address },
      )
      expectSelfHealed(override)
      expect(externalEvent(override)).toBeDefined()

      await makeStale()
      const acceptance = await acceptAdminRole(administrator, 201n)
      expectSelfHealed(acceptance)
      expect(
        tar.TokenAdminRegistry_AdministratorTransferred.fromSlice(externalEvent(acceptance))
          .queryId,
      ).toEqual(201n)
      expect((await entry.getTokenAdminRegistryConfig()).administrator).toEqual(
        administrator.address,
      )

      await makeStale()
      const transfer = await transferAdminRole(administrator, replacementAdministrator.address)
      expectSelfHealed(transfer)
      expect((await entry.getTokenAdminRegistryConfig()).pendingAdministrator).toEqual(
        replacementAdministrator.address,
      )

      await makeStale()
      const update = await setPool(administrator, replacementPool, 202n)
      expectSelfHealed(update)
      expect(tar.TokenAdminRegistry_PoolSet.fromSlice(externalEvent(update)).newPool).toEqual(
        replacementPool,
      )
      expect(await entry.getTokenInfo()).toEqual(tokenInfo(replacementPool))
      expect(await entryCode_()).toEqual(entryCode)
    })

    it('upgrades once when several requests reach a stale entry concurrently', async () => {
      await register()
      await makeStale()
      const entry = entryFor()

      const body = (queryId: bigint) =>
        tar.TokenAdminRegistry_GetTokenInfo.toCell(
          tar.TokenAdminRegistry_GetTokenInfo.create({ queryId, token }),
        )
      const result = await other.sendMessages([
        internal({ to: registry.address, value: toNano('0.1'), body: body(1n) }),
        internal({ to: registry.address, value: toNano('0.1'), body: body(2n) }),
      ])

      const upgrades = result.transactions.filter(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.dest.equals(entry.address) &&
          tx.outMessages.values().some((msg: Message) => msg.info.type === 'external-out'),
      )
      expect(upgrades).toHaveLength(1)
      const replies = result.transactions.filter(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src.equals(registry.address) &&
          tx.inMessage.info.dest.equals(other.address),
      )
      expect(
        replies.map(
          (tx) =>
            tar.TokenAdminRegistry_ReturnTokenInfo.fromSlice(tx.inMessage!.body.beginParse())
              .queryId,
        ),
      ).toEqual([1n, 2n])
      expect(await entryCode_()).toEqual(entryCode)
    })

    it('lets anyone upgrade an entry proactively to the root entry code', async () => {
      await register()
      await makeStale()

      const underfunded = await registry.sendTokenAdminRegistryUpgradeEntry(
        other.getSender(),
        toNano('0.01'),
        { tokenAddress: token },
      )
      expect(underfunded.transactions).toHaveTransaction({
        from: other.address,
        to: registry.address,
        success: false,
        exitCode: tar.TokenAdminRegistry.Errors['TokenAdminRegistry_Error.InsufficientValue'],
      })

      const result = await registry.sendTokenAdminRegistryUpgradeEntry(
        other.getSender(),
        toNano('0.1'),
        { tokenAddress: token },
      )
      expect(result.transactions).toHaveTransaction({
        from: registry.address,
        to: entryFor().address,
        op: tare.TokenAdminRegistryEntry_UpgradeAndResume.PREFIX,
        success: true,
      })
      expect(result.transactions).not.toHaveTransaction({
        op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      })
      expect(await entryCode_()).toEqual(entryCode)
      expect(await entryFor().getTokenInfo()).toEqual(tokenInfo())
    })

    it('rejects upgrade and resume messages from untrusted senders', async () => {
      await register()
      await makeStale()
      const entry = entryFor()
      const pending = tare.TokenAdminRegistryEntry_Pending.create({
        sender: registry.address,
        body: tare.TokenAdminRegistryEntry_SetPool.toCell(
          tare.TokenAdminRegistryEntry_SetPool.create({
            minEntryVersion: 1n,
            actor: other.address,
            tokenPool: replacementPool,
          }),
        ),
      })

      const upgrade = await entry.sendTokenAdminRegistryEntryUpgradeAndResume(
        other.getSender(),
        toNano('0.1'),
        { code: entryCode, pending: null },
      )
      expect(upgrade.transactions).toHaveTransaction({
        from: other.address,
        to: entry.address,
        success: false,
        exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
      })

      const resume = await entry.sendTokenAdminRegistryEntryResume(
        other.getSender(),
        toNano('0.1'),
        { pending },
      )
      expect(resume.transactions).toHaveTransaction({
        from: other.address,
        to: entry.address,
        success: false,
        exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
      })

      const request = await registry.sendTokenAdminRegistryEntryUpgradeRequest(
        other.getSender(),
        toNano('0.1'),
        { token, pending },
      )
      expect(request.transactions).toHaveTransaction({
        from: other.address,
        to: registry.address,
        success: false,
        exitCode: tar.TokenAdminRegistry.Errors['TokenAdminRegistry_Error.UnauthorizedEntry'],
      })

      expect(await entryCode_()).toEqual(staleEntryCode)
    })

    it('requires forwarded operations to fund a possible entry upgrade', async () => {
      await register()
      const underfunded = await registry.sendTokenAdminRegistryAcceptAdminRole(
        administrator.getSender(),
        toNano('0.03'),
        { tokenAddress: token },
      )
      expect(underfunded.transactions).toHaveTransaction({
        from: administrator.address,
        to: registry.address,
        success: false,
        exitCode: tar.TokenAdminRegistry.Errors['TokenAdminRegistry_Error.InsufficientValue'],
      })

      await makeStale()
      const minimal = await registry.sendTokenAdminRegistryAcceptAdminRole(
        administrator.getSender(),
        toNano('0.035'),
        { tokenAddress: token },
      )
      expectSelfHealed(minimal)
      expect((await entryFor().getTokenAdminRegistryConfig()).administrator).toEqual(
        administrator.address,
      )
    })

    it('answers a stale token info query funded with the executor budget', async () => {
      await register()
      await makeStale()

      // TokenAdminRegistry_GetTokenInfo.cost(0)
      const result = await getTokenInfo(other, toNano('0.03'))
      expectSelfHealed(result)
      expect(returnedTokenInfo(result, other.address).tokenPool).toEqual(pool)
    })
  })
})
