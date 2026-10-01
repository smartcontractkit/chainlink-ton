import '@ton/test-utils'

import { beginCell, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import {
  ENTRY_CONTRACT_VERSION,
  ENTRY_ERROR_CODE,
  ENTRY_FACILITY_ID,
  ENTRY_FACILITY_NAME,
  ENTRY_VERSION,
} from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  EntryErrors,
  Fixture,
  coverageConfig,
  createBlockchain,
  deployTokenAdminRegistryEntry,
  entryAddress,
  entryFor,
  registerToken,
  setup,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistryEntry - TypeAndVersion Tests', () => {
  const typeAndVersionSpec = TypeAndVersionSpec.newInstance({
    type: ENTRY_FACILITY_NAME,
    version: ENTRY_CONTRACT_VERSION,
    deployContract: deployTokenAdminRegistryEntry,
  })
  typeAndVersionSpec.run([{ code: 'TokenAdminRegistryEntry', name: 'token_admin_registry_entry' }])
})

describe('TokenAdminRegistryEntry - Opcodes', () => {
  it('should match in opcodes', () => {
    const names = [
      'TokenAdminRegistryEntry_MessageFromRoot',
      'TokenAdminRegistryEntry_GetTokenInfo',
      'TokenAdminRegistryEntry_RegistrationInitialized',
      'TokenAdminRegistryEntry_UpgradeAndResume',
      'TokenAdminRegistryEntry_Resume',
      'TokenAdminRegistryEntry_ResolveTokenInfo',
      'TokenAdminRegistryEntry_ProposeAdministrator',
      'TokenAdminRegistryEntry_TransferAdminRole',
      'TokenAdminRegistryEntry_AcceptAdminRole',
      'TokenAdminRegistryEntry_SetPool',
    ] as const
    for (const name of names) {
      expect(tare[name].PREFIX).toBe(crc32(name))
    }
  })

  it('should match out opcodes', () => {
    expect(tare.TokenAdminRegistryEntry_ReturnTokenInfo.PREFIX).toBe(
      crc32('TokenAdminRegistryEntry_ReturnTokenInfo'),
    )
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
