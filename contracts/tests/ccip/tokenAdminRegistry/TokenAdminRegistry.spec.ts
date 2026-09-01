import { Address, Cell, Message, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
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
  let entryCode: Cell
  let registry: SandboxContract<tar.TokenAdminRegistry>
  let nextRegistryId = 0n

  const tokenInfo = (tokenPool = pool, enabled = true) =>
    tar.TokenRegistry_TokenInfo.create({
      tokenPool,
      minterAddress: token,
      enabled,
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

  const register = async (proposedAdministrator = administrator.address) => {
    const result = await registry.sendTokenAdminRegistryRegisterToken(
      owner.getSender(),
      toNano('0.1'),
      {
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

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployableCode = await contractCode.ccip.local('Deployable')
    entryCode = await contractCode.ccip.local('TokenAdminRegistryEntry')
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
          entryDeployment: tar.TokenAdminRegistry_EntryDeployment.create({
            deployableCode,
            entryCode,
          }),
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

  it('allows only the root owner to change entry deployment configuration', async () => {
    const deployment = tar.TokenAdminRegistry_EntryDeployment.create({
      deployableCode: Cell.EMPTY,
      entryCode: Cell.EMPTY,
    })
    const result = await registry.sendTokenAdminRegistrySetEntryDeployment(
      other.getSender(),
      toNano('0.05'),
      { entryDeployment: deployment },
    )

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    const ownerResult = await registry.sendTokenAdminRegistrySetEntryDeployment(
      owner.getSender(),
      toNano('0.05'),
      {
        entryDeployment: tar.TokenAdminRegistry_EntryDeployment.create({
          deployableCode,
          entryCode,
        }),
      },
    )
    expect(ownerResult.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      success: true,
      op: tar.TokenAdminRegistry_SetEntryDeployment.PREFIX,
    })
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

    const oldOwnerUpdate = await registry.sendTokenAdminRegistrySetEntryDeployment(
      owner.getSender(),
      toNano('0.05'),
      {
        entryDeployment: tar.TokenAdminRegistry_EntryDeployment.create({
          deployableCode,
          entryCode,
        }),
      },
    )
    expect(oldOwnerUpdate.transactions).toHaveTransaction({
      from: owner.address,
      to: registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    const newOwnerUpdate = await registry.sendTokenAdminRegistrySetEntryDeployment(
      other.getSender(),
      toNano('0.05'),
      {
        entryDeployment: tar.TokenAdminRegistry_EntryDeployment.create({
          deployableCode,
          entryCode,
        }),
      },
    )
    expect(newOwnerUpdate.transactions).toHaveTransaction({
      from: other.address,
      to: registry.address,
      success: true,
    })
  })

  it('registers a token at its deterministic entry address and relays the proposal event', async () => {
    const result = await register()
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
        tokenInfo: tokenInfo(replacementPool, false),
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
      toNano('0.05'),
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

    const invalidAcceptance = await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      other.getSender(),
      toNano('0.05'),
      {},
    )
    expect(invalidAcceptance.transactions).toHaveTransaction({
      from: other.address,
      to: entry.address,
      success: false,
      exitCode:
        tare.TokenAdminRegistryEntry.Errors[
          'TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'
        ],
    })

    const acceptance = await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {},
    )
    expect(
      tar.TokenAdminRegistry_AdministratorTransferred.fromSlice(externalEvent(acceptance)),
    ).toEqual(
      tar.TokenAdminRegistry_AdministratorTransferred.create({
        token,
        newAdministrator: administrator.address,
      }),
    )

    const unauthorizedTransfer = await entry.sendTokenAdminRegistryEntryTransferAdminRole(
      other.getSender(),
      toNano('0.05'),
      { newAdministrator: replacementAdministrator.address },
    )
    expect(unauthorizedTransfer.transactions).toHaveTransaction({
      from: other.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const transfer = await entry.sendTokenAdminRegistryEntryTransferAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      { newAdministrator: replacementAdministrator.address },
    )
    const transferEvent = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
      externalEvent(transfer),
    )
    expect(transferEvent.currentAdministrator).toEqual(administrator.address)
    expect(transferEvent.newAdministrator).toEqual(replacementAdministrator.address)

    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      replacementAdministrator.getSender(),
      toNano('0.05'),
      {},
    )
    const config = await entry.getTokenAdminRegistryConfig()
    expect(config.administrator).toEqual(replacementAdministrator.address)
    expect(config.pendingAdministrator).toBeNull()

    const overrideAfterAcceptance =
      await registry.sendTokenAdminRegistryOverridePendingAdministrator(
        owner.getSender(),
        toNano('0.05'),
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

  it('keeps permissions with the active administrator until a transfer is accepted', async () => {
    await register()
    const entry = entryFor()
    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {},
    )
    await entry.sendTokenAdminRegistryEntryTransferAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {
        newAdministrator: replacementAdministrator.address,
      },
    )

    const pendingAdminUpdate = await entry.sendTokenAdminRegistryEntrySetPool(
      replacementAdministrator.getSender(),
      toNano('0.05'),
      { tokenPool: replacementPool, enabled: true },
    )
    expect(pendingAdminUpdate.transactions).toHaveTransaction({
      from: replacementAdministrator.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const currentAdminUpdate = await entry.sendTokenAdminRegistryEntrySetPool(
      administrator.getSender(),
      toNano('0.05'),
      { tokenPool: replacementPool, enabled: true },
    )
    expect(currentAdminUpdate.transactions).toHaveTransaction({
      from: administrator.address,
      to: entry.address,
      success: true,
    })

    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      replacementAdministrator.getSender(),
      toNano('0.05'),
      {},
    )
    const formerAdminUpdate = await entry.sendTokenAdminRegistryEntrySetPool(
      administrator.getSender(),
      toNano('0.05'),
      { tokenPool: pool, enabled: true },
    )
    expect(formerAdminUpdate.transactions).toHaveTransaction({
      from: administrator.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })
  })

  it('allows the active administrator to cancel a pending transfer', async () => {
    await register()
    const entry = entryFor()
    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {},
    )
    await entry.sendTokenAdminRegistryEntryTransferAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {
        newAdministrator: replacementAdministrator.address,
      },
    )

    const cancellation = await entry.sendTokenAdminRegistryEntryTransferAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      { newAdministrator: null },
    )
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
    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {},
    )

    const unauthorized = await entry.sendTokenAdminRegistryEntrySetPool(
      other.getSender(),
      toNano('0.05'),
      {
        tokenPool: replacementPool,
        enabled: false,
      },
    )
    expect(unauthorized.transactions).toHaveTransaction({
      from: other.address,
      to: entry.address,
      success: false,
      exitCode: tare.TokenAdminRegistryEntry.Errors['TokenAdminRegistryEntry_Error.Unauthorized'],
    })

    const update = await entry.sendTokenAdminRegistryEntrySetPool(
      administrator.getSender(),
      toNano('0.05'),
      {
        tokenPool: replacementPool,
        enabled: false,
      },
    )
    expect(await entry.getTokenInfo()).toEqual(tokenInfo(replacementPool, false))
    const event = tar.TokenAdminRegistry_PoolSet.fromSlice(externalEvent(update))
    expect(event).toEqual(
      tar.TokenAdminRegistry_PoolSet.create({
        token,
        previousPool: pool,
        newPool: replacementPool,
        previousEnabled: true,
        newEnabled: false,
      }),
    )

    const noOp = await entry.sendTokenAdminRegistryEntrySetPool(
      administrator.getSender(),
      toNano('0.05'),
      { tokenPool: replacementPool, enabled: false },
    )
    expect(noOp.transactions).not.toHaveTransaction({ from: entry.address, to: registry.address })
  })

  it('returns no pool for disabled entries while preserving token metadata', async () => {
    await register()
    const entry = entryFor()
    await entry.sendTokenAdminRegistryEntryAcceptAdminRole(
      administrator.getSender(),
      toNano('0.05'),
      {},
    )
    await entry.sendTokenAdminRegistryEntrySetPool(administrator.getSender(), toNano('0.05'), {
      tokenPool: pool,
      enabled: false,
    })

    const query = await entry.sendTokenAdminRegistryEntryGetTokenInfo(
      other.getSender(),
      toNano('0.05'),
      {},
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
})
