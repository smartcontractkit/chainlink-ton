import '@ton/test-utils'

import { beginCell, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import { Costs, EventTopics } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  CELL_UNDERFLOW,
  EntryErrors,
  Fixture,
  RegistryErrors,
  acceptAdminRole,
  coverageConfig,
  createBlockchain,
  entryAddress,
  entryFor,
  expectEntryFailure,
  expectEntrySuccess,
  expectRootFailure,
  messageFromRoot,
  overridePendingAdministrator,
  registerAndAccept,
  registerToken,
  rootEvent,
  rootEvents,
  setPool,
  setup,
  transferAdminRole,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - Administrator', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  const adminConfig = () => entryFor(fx).getTokenAdminRegistryConfig()

  describe('override pending administrator', () => {
    it('lets the root owner replace an unaccepted proposal', async () => {
      await registerToken(fx)
      const result = await overridePendingAdministrator(
        fx,
        fx.owner,
        fx.replacementAdministrator.address,
        7n,
      )
      expectEntrySuccess(fx, result)

      expect(await adminConfig()).toEqual(
        tare.TokenRegistry_AdminConfig.create({
          tokenAdminRegistry: fx.registry.address,
          administrator: null,
          pendingAdministrator: fx.replacementAdministrator.address,
        }),
      )
      expect(
        tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
          rootEvent(fx, result, EventTopics.AdministratorTransferRequested),
        ),
      ).toEqual(
        tar.TokenAdminRegistry_AdministratorTransferRequested.create({
          queryId: 7n,
          token: fx.token,
          currentAdministrator: null,
          newAdministrator: fx.replacementAdministrator.address,
        }),
      )

      const staleAcceptance = await acceptAdminRole(fx, fx.administrator)
      expectEntryFailure(
        fx,
        staleAcceptance,
        EntryErrors['TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'],
      )
    })

    it('rejects non-owners', async () => {
      await registerToken(fx)
      const result = await overridePendingAdministrator(fx, fx.other, fx.other.address)
      expectRootFailure(fx, result, fx.other.address, ownable2step.Errors.OnlyCallableByOwner)
      expect((await adminConfig()).pendingAdministrator).toEqualAddress(fx.administrator.address)
    })

    it('cannot reclaim a token once an administrator has accepted', async () => {
      await registerAndAccept(fx)
      const result = await overridePendingAdministrator(fx, fx.owner, fx.other.address)
      expectEntryFailure(fx, result, EntryErrors['TokenAdminRegistryEntry_Error.AlreadyRegistered'])

      const config = await adminConfig()
      expect(config.administrator).toEqualAddress(fx.administrator.address)
      expect(config.pendingAdministrator).toBeNull()
    })

    // `address` cannot hold addr_none, so the message is rejected while being parsed.
    it('rejects an empty administrator', async () => {
      await registerToken(fx)
      const body = beginCell()
        .storeUint(tar.TokenAdminRegistry_OverridePendingAdministrator.PREFIX, 32)
        .storeUint(0, 64)
        .storeAddress(fx.token)
        .storeAddress(null)
        .endCell()
      const result = await fx.owner.send({ to: fx.registry.address, value: toNano('0.1'), body })
      expectRootFailure(fx, result, fx.owner.address, CELL_UNDERFLOW)
    })

    it('requires the forward cost', async () => {
      await registerToken(fx)
      const result = await overridePendingAdministrator(
        fx,
        fx.owner,
        fx.replacementAdministrator.address,
        0n,
        Costs.forward - 1n,
      )
      expectRootFailure(
        fx,
        result,
        fx.owner.address,
        RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
      )
    })
  })

  describe('accept admin role', () => {
    it('lets the pending administrator accept and relays the event', async () => {
      await registerToken(fx)
      const result = await acceptAdminRole(fx, fx.administrator, 102n)
      expectEntrySuccess(fx, result)

      expect(
        tar.TokenAdminRegistry_AdministratorTransferred.fromSlice(
          rootEvent(fx, result, EventTopics.AdministratorTransferred),
        ),
      ).toEqual(
        tar.TokenAdminRegistry_AdministratorTransferred.create({
          queryId: 102n,
          token: fx.token,
          newAdministrator: fx.administrator.address,
        }),
      )
      const config = await adminConfig()
      expect(config.administrator).toEqualAddress(fx.administrator.address)
      expect(config.pendingAdministrator).toBeNull()
    })

    it('rejects anyone but the pending administrator', async () => {
      await registerToken(fx)
      for (const actor of [fx.other, fx.owner]) {
        const result = await acceptAdminRole(fx, actor)
        expectEntryFailure(
          fx,
          result,
          EntryErrors['TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'],
        )
      }
      expect((await adminConfig()).administrator).toBeNull()
    })

    it('rejects acceptance when no transfer is pending', async () => {
      await registerAndAccept(fx)
      const result = await acceptAdminRole(fx, fx.administrator)
      expectEntryFailure(
        fx,
        result,
        EntryErrors['TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'],
      )
    })

    it('requires the forward cost', async () => {
      await registerToken(fx)
      const underfunded = await acceptAdminRole(fx, fx.administrator, 0n, Costs.forward - 1n)
      expectRootFailure(
        fx,
        underfunded,
        fx.administrator.address,
        RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
      )

      const minimal = await acceptAdminRole(fx, fx.administrator, 0n, Costs.forward)
      expectEntrySuccess(fx, minimal)
      expect((await adminConfig()).administrator).toEqualAddress(fx.administrator.address)
    })
  })

  describe('transfer admin role', () => {
    it('keeps the transfer two-step and relays the request event', async () => {
      await registerAndAccept(fx)
      const transfer = await transferAdminRole(
        fx,
        fx.administrator,
        fx.replacementAdministrator.address,
        103n,
      )
      expect(
        tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
          rootEvent(fx, transfer, EventTopics.AdministratorTransferRequested),
        ),
      ).toEqual(
        tar.TokenAdminRegistry_AdministratorTransferRequested.create({
          queryId: 103n,
          token: fx.token,
          currentAdministrator: fx.administrator.address,
          newAdministrator: fx.replacementAdministrator.address,
        }),
      )
      let config = await adminConfig()
      expect(config.administrator).toEqualAddress(fx.administrator.address)
      expect(config.pendingAdministrator).toEqualAddress(fx.replacementAdministrator.address)

      await acceptAdminRole(fx, fx.replacementAdministrator)
      config = await adminConfig()
      expect(config.administrator).toEqualAddress(fx.replacementAdministrator.address)
      expect(config.pendingAdministrator).toBeNull()
    })

    it('rejects transfers by anyone but the active administrator', async () => {
      await registerAndAccept(fx)
      for (const actor of [fx.other, fx.owner]) {
        const result = await transferAdminRole(fx, actor, actor.address)
        expectEntryFailure(fx, result, EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'])
      }
      expect((await adminConfig()).pendingAdministrator).toBeNull()
    })

    it('rejects transfers by a pending administrator before acceptance', async () => {
      await registerToken(fx)
      const result = await transferAdminRole(fx, fx.administrator, fx.other.address)
      expectEntryFailure(fx, result, EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'])
    })

    it('keeps permissions with the active administrator until the transfer is accepted', async () => {
      await registerAndAccept(fx)
      await transferAdminRole(fx, fx.administrator, fx.replacementAdministrator.address)

      const pendingAdminUpdate = await setPool(fx, fx.replacementAdministrator, fx.replacementPool)
      expectEntryFailure(
        fx,
        pendingAdminUpdate,
        EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
      )
      expectEntrySuccess(fx, await setPool(fx, fx.administrator, fx.replacementPool))

      await acceptAdminRole(fx, fx.replacementAdministrator)
      const formerAdminUpdate = await setPool(fx, fx.administrator, fx.pool)
      expectEntryFailure(
        fx,
        formerAdminUpdate,
        EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
      )
    })

    it('lets the active administrator cancel a pending transfer', async () => {
      await registerAndAccept(fx)
      await transferAdminRole(fx, fx.administrator, fx.replacementAdministrator.address)

      const cancellation = await transferAdminRole(fx, fx.administrator, null)
      const event = tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
        rootEvent(fx, cancellation, EventTopics.AdministratorTransferRequested),
      )
      expect(event.currentAdministrator).toEqualAddress(fx.administrator.address)
      expect(event.newAdministrator).toBeNull()

      const config = await adminConfig()
      expect(config.administrator).toEqualAddress(fx.administrator.address)
      expect(config.pendingAdministrator).toBeNull()

      const staleAcceptance = await acceptAdminRole(fx, fx.replacementAdministrator)
      expectEntryFailure(
        fx,
        staleAcceptance,
        EntryErrors['TokenAdminRegistryEntry_Error.OnlyPendingAdministrator'],
      )
    })

    it('requires the forward cost', async () => {
      await registerAndAccept(fx)
      const result = await transferAdminRole(
        fx,
        fx.administrator,
        fx.replacementAdministrator.address,
        0n,
        Costs.forward - 1n,
      )
      expectRootFailure(
        fx,
        result,
        fx.administrator.address,
        RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
      )
    })
  })

  it('rejects direct entry lifecycle calls even when they claim a valid actor', async () => {
    await registerToken(fx)
    const entry = entryFor(fx)
    const contents = [
      tare.TokenAdminRegistryEntry_AcceptAdminRole.create({ actor: fx.administrator.address }),
      tare.TokenAdminRegistryEntry_TransferAdminRole.create({
        actor: fx.administrator.address,
        newAdministrator: fx.other.address,
      }),
      tare.TokenAdminRegistryEntry_ProposeAdministrator.create({
        administrator: fx.other.address,
      }),
      tare.TokenAdminRegistryEntry_SetPool.create({
        actor: fx.administrator.address,
        tokenPool: fx.replacementPool,
      }),
    ]
    for (const content of contents) {
      const result = await entry.sendTokenAdminRegistryEntryMessageFromRoot(
        fx.administrator.getSender(),
        toNano('0.05'),
        messageFromRoot(content),
      )
      expect(result.transactions).toHaveTransaction({
        from: fx.administrator.address,
        to: entry.address,
        success: false,
        exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
      })
      expect(rootEvents(fx, result, EventTopics.AdministratorTransferRequested)).toHaveLength(0)
    }

    expect(await adminConfig()).toEqual(
      tare.TokenRegistry_AdminConfig.create({
        tokenAdminRegistry: fx.registry.address,
        administrator: null,
        pendingAdministrator: fx.administrator.address,
      }),
    )
  })

  it('does not affect other tokens', async () => {
    await registerAndAccept(fx)
    await registerToken(fx, { token: fx.otherToken })

    await transferAdminRole(fx, fx.administrator, fx.replacementAdministrator.address)
    const otherConfig = await entryFor(fx, fx.otherToken).getTokenAdminRegistryConfig()
    expect(otherConfig.administrator).toBeNull()
    expect(otherConfig.pendingAdministrator).toEqualAddress(fx.administrator.address)
    expect(entryAddress(fx, fx.otherToken)).not.toEqualAddress(entryAddress(fx))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_administrator',
        await coverageConfig(),
      )
    }
  })
})
