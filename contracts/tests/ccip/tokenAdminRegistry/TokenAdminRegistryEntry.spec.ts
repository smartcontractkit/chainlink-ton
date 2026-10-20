import '@ton/test-utils'

import { beginCell, toNano } from '@ton/core'
import { Blockchain, internal } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import { errorCode, facilityId } from '../../../wrappers/utils'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import {
  ENTRY_CONTRACT_VERSION,
  ENTRY_ERROR_CODE,
  ENTRY_FACILITY_ID,
  ENTRY_FACILITY_NAME,
  ENTRY_VERSION,
  EventTopics,
} from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  EntryErrors,
  Fixture,
  acceptAdminRole,
  accountState,
  asEntry,
  asRoot,
  coverageConfig,
  createBlockchain,
  deployTokenAdminRegistryEntry,
  entryAddress,
  entryFor,
  expectEntrySuccess,
  messageFromRoot,
  registerToken,
  rootEvents,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistryEntry - TypeAndVersion Tests', () => {
  const typeAndVersionSpec = TypeAndVersionSpec.newInstance({
    type: ENTRY_FACILITY_NAME,
    version: ENTRY_CONTRACT_VERSION,
    deployContract: deployTokenAdminRegistryEntry,
  })
  typeAndVersionSpec.run([{ code: 'TokenAdminRegistryEntry', name: 'token_admin_registry_entry' }])
})

describe('TokenAdminRegistryEntry - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: ENTRY_FACILITY_NAME,
    currentVersion: ENTRY_CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('TokenAdminRegistryEntry'),
    CurrentVersionConstructor: tare.TokenAdminRegistryEntry.fromAddress,
    deployCurrentContract: deployTokenAdminRegistryEntry,
  })
  currentVersionSpec.run('token_admin_registry_entry')
})

describe('TokenAdminRegistryEntry - Opcodes', () => {
  it('should match in opcodes', () => {
    const names = [
      'TokenAdminRegistryEntry_MessageFromRoot',
      'TokenAdminRegistryEntry_RegistrationInitialized',
      'TokenAdminRegistryEntry_Resume',
      'TokenAdminRegistryEntry_GetTokenInfo',
      'TokenAdminRegistryEntry_ProposeAdministrator',
      'TokenAdminRegistryEntry_TransferAdminRole',
      'TokenAdminRegistryEntry_AcceptAdminRole',
      'TokenAdminRegistryEntry_SetPool',
    ] as const
    for (const name of names) {
      expect(tare[name].PREFIX).toBe(crc32(name))
    }
  })
})

describe('TokenAdminRegistryEntry - Unit Tests', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
    await registerToken(fx)
  })

  it('should match facility name and error codes', () => {
    expect(ENTRY_FACILITY_ID).toEqual(facilityId(crc32(ENTRY_FACILITY_NAME)))
    expect(ENTRY_ERROR_CODE).toEqual(errorCode(crc32(ENTRY_FACILITY_NAME)))
    const errors = [
      'TokenAdminRegistryEntry_Error.Unauthorized',
      'TokenAdminRegistryEntry_Error.OnlyPendingAdministrator',
      'TokenAdminRegistryEntry_Error.AlreadyRegistered',
      'TokenAdminRegistryEntry_Error.InvalidAdministrator',
      'TokenAdminRegistryEntry_Error.VersionUnavailable',
    ] as const
    errors.forEach((name, i) => expect(EntryErrors[name]).toBe(ENTRY_ERROR_CODE + i))
  })

  it('reports its entry version', async () => {
    expect(await entryFor(fx).getEntryVersion()).toBe(ENTRY_VERSION)
  })

  it('accepts empty-body top ups', async () => {
    const result = await fx.other.send({
      to: entryAddress(fx),
      value: toNano('0.05'),
      body: beginCell().endCell(),
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entryAddress(fx),
      success: true,
    })
  })

  it('rejects unknown opcodes', async () => {
    const result = await fx.other.send({
      to: entryAddress(fx),
      value: toNano('0.05'),
      body: beginCell().storeUint(0xdeadbeef, 32).storeUint(0, 64).endCell(),
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: entryAddress(fx),
      success: false,
      exitCode: 0xffff,
    })
  })

  const fromRootToEntry = (result: { transactions: any[] }, op: number) =>
    result.transactions.filter(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(fx.registry.address) &&
        tx.inMessage.info.dest.equals(entryAddress(fx)) &&
        tx.inMessage.body.beginParse().preloadUint(32) === op,
    )

  it('rejects a self-sent registration-initialized once the administrator has accepted', async () => {
    expectEntrySuccess(fx, await acceptAdminRole(fx, fx.administrator))
    const result = await entryFor(fx).sendTokenAdminRegistryEntryRegistrationInitialized(
      asEntry(fx),
      toNano('0.05'),
      { queryId: 1n },
    )
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: entryAddress(fx),
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.InvalidAdministrator'],
    })
    expect(rootEvents(fx, result, EventTopics.AdministratorTransferRequested)).toHaveLength(0)
  })

  it('skips an upgrade to the code it already runs', async () => {
    const before = await accountState(fx)
    const result = await entryFor(fx).sendUpgradeableUpgrade(asRoot(fx), toNano('0.05'), {
      code: before.code,
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      success: true,
    })
    const [upgradeTx] = fromRootToEntry(result, tare.Upgradeable_Upgrade.PREFIX)
    expect(upgradeTx.outMessages.size).toBe(0)
    expect(await accountState(fx)).toEqual(before)
  })

  it('applies administration requests replayed through Resume', async () => {
    const result = await entryFor(fx).sendTokenAdminRegistryEntryResume(
      asRoot(fx),
      toNano('0.05'),
      {
        request: messageFromRoot(
          tare.TokenAdminRegistryEntry_AcceptAdminRole.create({ actor: fx.administrator.address }),
        ),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
      op: tar.TokenAdminRegistry_AdministratorTransferred.PREFIX,
      success: true,
    })
    expect(await entryFor(fx).getTokenAdminRegistryConfig()).toEqual(
      tare.TokenRegistry_AdminConfig.create({
        tokenAdminRegistry: fx.registry.address,
        administrator: fx.administrator.address,
        pendingAdministrator: null,
      }),
    )
  })

  it('does not bounce a failed administration replay back to the root', async () => {
    expectEntrySuccess(fx, await acceptAdminRole(fx, fx.administrator))
    const result = await entryFor(fx).sendTokenAdminRegistryEntryMessageFromRoot(
      asRoot(fx),
      toNano('0.1'),
      messageFromRoot(
        tare.TokenAdminRegistryEntry_SetPool.create({
          actor: fx.administrator.address,
          tokenPool: fx.replacementPool,
        }),
        ENTRY_VERSION + 1n,
      ),
    )
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
      op: tar.TokenAdminRegistry_EntryUpgradeRequest.PREFIX,
      success: true,
    })
    const [resumeTx] = fromRootToEntry(result, tare.TokenAdminRegistryEntry_Resume.PREFIX)
    expect(resumeTx.inMessage.info.bounce).toBe(false)
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      op: tare.TokenAdminRegistryEntry_Resume.PREFIX,
      success: false,
      exitCode: EntryErrors['TokenAdminRegistryEntry_Error.VersionUnavailable'],
    })
    expect(result.transactions).not.toHaveTransaction({
      to: fx.registry.address,
      inMessageBounced: true,
    })
    expect(await entryFor(fx).getTokenInfo()).toEqual(tokenInfo(fx))
  })

  it('rejects root requests with unknown content', async () => {
    const before = await accountState(fx)
    const result = await blockchain.sendMessage(
      internal({
        from: fx.registry.address,
        to: entryAddress(fx),
        value: toNano('0.05'),
        body: beginCell()
          .storeUint(tare.TokenAdminRegistryEntry_MessageFromRoot.PREFIX, 32)
          .storeUint(0, 64)
          .storeUint(ENTRY_VERSION, 16)
          .storeRef(beginCell().storeUint(0xdeadbeef, 32).endCell())
          .endCell(),
      }),
    )
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      to: entryAddress(fx),
      success: false,
    })
    expect(await accountState(fx)).toEqual(before)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_entry_unit_tests',
        await coverageConfig(),
      )
    }
  })
})
