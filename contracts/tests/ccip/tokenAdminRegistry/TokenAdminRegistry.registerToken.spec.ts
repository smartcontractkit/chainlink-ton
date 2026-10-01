import '@ton/test-utils'

import { beginCell, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import { Costs, ENTRY_VERSION, EventTopics } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  CELL_UNDERFLOW,
  EntryErrors,
  Fixture,
  OPERATION_VALUE,
  RegistryErrors,
  accountState,
  coverageConfig,
  createBlockchain,
  entryAddress,
  entryFor,
  expectRootFailure,
  registerToken,
  rootEvent,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - Register Token', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  it('deploys the entry at its deterministic address with a pending administrator', async () => {
    await registerToken(fx)
    const entry = entryFor(fx)

    expect(await entry.getTokenAdminRegistryConfig()).toEqual(
      tare.TokenRegistry_AdminConfig.create({
        tokenAdminRegistry: fx.registry.address,
        administrator: null,
        pendingAdministrator: fx.administrator.address,
      }),
    )
    expect(await entry.getTokenInfo()).toEqual(tokenInfo(fx))
  })

  it('deploys the entry with the entry code compiled into the root', async () => {
    await registerToken(fx)
    expect((await accountState(fx)).code).toEqual(
      await contractCode.ccip.local('TokenAdminRegistryEntry'),
    )
    expect(await entryFor(fx).getEntryVersion()).toEqual(ENTRY_VERSION)
  })

  it('relays the initial administrator proposal event through the root', async () => {
    const result = await registerToken(fx, { queryId: 101n })

    expect(
      tar.TokenAdminRegistry_AdministratorTransferRequested.fromSlice(
        rootEvent(fx, result, EventTopics.AdministratorTransferRequested),
      ),
    ).toEqual(
      tar.TokenAdminRegistry_AdministratorTransferRequested.create({
        queryId: 101n,
        token: fx.token,
        currentAdministrator: null,
        newAdministrator: fx.administrator.address,
      }),
    )
  })

  it('registers tokens into independent entries', async () => {
    await registerToken(fx)
    await registerToken(fx, {
      token: fx.otherToken,
      administrator: fx.replacementAdministrator.address,
    })

    expect(entryAddress(fx)).not.toEqualAddress(entryAddress(fx, fx.otherToken))
    expect((await entryFor(fx).getTokenAdminRegistryConfig()).pendingAdministrator).toEqualAddress(
      fx.administrator.address,
    )
    const otherEntry = entryFor(fx, fx.otherToken)
    expect((await otherEntry.getTokenAdminRegistryConfig()).pendingAdministrator).toEqualAddress(
      fx.replacementAdministrator.address,
    )
    expect(await otherEntry.getTokenInfo()).toEqual(tokenInfo(fx, fx.pool, fx.otherToken))
  })

  it('rejects registration by non-owners', async () => {
    const result = await fx.registry.sendTokenAdminRegistryRegisterToken(
      fx.other.getSender(),
      OPERATION_VALUE,
      {
        tokenAddress: fx.token,
        tokenInfo: tokenInfo(fx),
        administrator: fx.administrator.address,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: fx.registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })
    expect(result.transactions).not.toHaveTransaction({ to: entryAddress(fx) })
  })

  it('requires value for the entry deployment', async () => {
    const result = await fx.registry.sendTokenAdminRegistryRegisterToken(
      fx.owner.getSender(),
      Costs.registerToken - 1n,
      {
        tokenAddress: fx.token,
        tokenInfo: tokenInfo(fx),
        administrator: fx.administrator.address,
      },
    )
    expectRootFailure(
      fx,
      result,
      fx.owner.address,
      RegistryErrors['TokenAdminRegistry_Error.InsufficientValue'],
    )
    expect(result.transactions).not.toHaveTransaction({ to: entryAddress(fx) })
  })

  // `address` cannot hold addr_none, so the message is rejected while being parsed.
  it('rejects registration without an administrator', async () => {
    const body = beginCell()
      .storeUint(tar.TokenAdminRegistry_RegisterToken.PREFIX, 32)
      .storeUint(0, 64)
      .storeAddress(fx.token)
      .storeRef(tar.TokenRegistry_TokenInfo.toCell(tokenInfo(fx)))
      .storeAddress(null)
      .endCell()
    const result = await fx.owner.send({ to: fx.registry.address, value: OPERATION_VALUE, body })
    expect(result.transactions).toHaveTransaction({
      from: fx.owner.address,
      to: fx.registry.address,
      success: false,
      exitCode: CELL_UNDERFLOW,
    })
    expect(result.transactions).not.toHaveTransaction({ to: entryAddress(fx) })
  })

  it('is create-only and leaves an existing entry unchanged on retry', async () => {
    await registerToken(fx)
    const entry = entryFor(fx)
    const before = await accountState(fx)

    const retry = await fx.registry.sendTokenAdminRegistryRegisterToken(
      fx.owner.getSender(),
      OPERATION_VALUE,
      {
        tokenAddress: fx.token,
        tokenInfo: tokenInfo(fx, fx.replacementPool),
        administrator: fx.replacementAdministrator.address,
      },
    )
    expect(retry.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entry.address,
      success: false,
    })
    expect(await accountState(fx)).toEqual(before)
  })

  it('rejects a registration-initialized message not sent by the entry itself', async () => {
    await registerToken(fx)
    const entry = entryFor(fx)

    for (const sender of [fx.other.getSender(), blockchain.sender(fx.registry.address)]) {
      const result = await entry.sendTokenAdminRegistryEntryRegistrationInitialized(
        sender,
        toNano('0.05'),
        { queryId: 1n },
      )
      expect(result.transactions).toHaveTransaction({
        to: entry.address,
        success: false,
        exitCode: EntryErrors['TokenAdminRegistryEntry_Error.Unauthorized'],
      })
    }
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_register_token',
        await coverageConfig(),
      )
    }
  })
})
