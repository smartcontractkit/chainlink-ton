import '@ton/test-utils'

import { beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'
import { contractCode } from '../../../wrappers/codeLoader'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { ownable2StepSpec } from '../../lib/access/Ownable2StepSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import {
  CONTRACT_VERSION,
  ERROR_CODE,
  EventTopics,
  FACILITY_ID,
  FACILITY_NAME,
} from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  Fixture,
  OPERATION_VALUE,
  RegistryErrors,
  accountState,
  coverageConfig,
  createBlockchain,
  deployTokenAdminRegistry,
  registerToken,
  setup,
  tokenInfo,
} from './TokenAdminRegistry.Setup'

describe('TokenAdminRegistry - TypeAndVersion Tests', () => {
  const typeAndVersionSpec = TypeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
    deployContract: deployTokenAdminRegistry,
  })
  typeAndVersionSpec.run([{ code: 'TokenAdminRegistry', name: 'token_admin_registry' }])
})

describe('TokenAdminRegistry - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: FACILITY_NAME,
    currentVersion: CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('TokenAdminRegistry'),
    CurrentVersionConstructor: tar.TokenAdminRegistry.fromAddress,
    deployCurrentContract: deployTokenAdminRegistry,
  })
  currentVersionSpec.run('token_admin_registry')
})

describe('TokenAdminRegistry - Ownable Tests', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  it('supports ownable messages', async () => {
    await ownable2StepSpec(fx.owner, fx.other, fx.registry, {
      coverage: { blockchain, conf: await coverageConfig() },
    })
  })

  it('moves owner-only permissions with root ownership', async () => {
    await fx.registry.sendOwnable2StepTransferOwnership(fx.owner.getSender(), toNano('0.05'), {
      newOwner: fx.other.address,
    })
    await fx.registry.sendOwnable2StepAcceptOwnership(fx.other.getSender(), toNano('0.05'), {})
    expect(await fx.registry.getOwner()).toEqualAddress(fx.other.address)
    expect(await fx.registry.getPendingOwner()).toBeNull()

    const registration = {
      tokenAddress: fx.token,
      tokenInfo: tokenInfo(fx),
      administrator: fx.administrator.address,
    }
    const oldOwner = await fx.registry.sendTokenAdminRegistryRegisterToken(
      fx.owner.getSender(),
      OPERATION_VALUE,
      registration,
    )
    expect(oldOwner.transactions).toHaveTransaction({
      from: fx.owner.address,
      to: fx.registry.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    const newOwner = await fx.registry.sendTokenAdminRegistryRegisterToken(
      fx.other.getSender(),
      OPERATION_VALUE,
      registration,
    )
    expect(newOwner.transactions).toHaveTransaction({
      from: fx.other.address,
      to: fx.registry.address,
      success: true,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_ownable',
        await coverageConfig(),
      )
    }
  })
})

describe('TokenAdminRegistry - Opcodes', () => {
  it('should match in opcodes', () => {
    const names = [
      'TokenAdminRegistry_RegisterToken',
      'TokenAdminRegistry_OverridePendingAdministrator',
      'TokenAdminRegistry_TransferAdminRole',
      'TokenAdminRegistry_AcceptAdminRole',
      'TokenAdminRegistry_SetPool',
      'TokenAdminRegistry_GetTokenInfo',
      'TokenAdminRegistryEntry_TokenInfo',
      'TokenAdminRegistry_EntryUpgradeRequest',
      'TokenAdminRegistry_UpgradeEntry',
      'TokenAdminRegistry_AdministratorTransferRequested',
      'TokenAdminRegistry_AdministratorTransferred',
      'TokenAdminRegistry_PoolSet',
    ] as const
    for (const name of names) {
      expect(tar[name].PREFIX).toBe(crc32(name))
    }
  })

  it('should match out opcodes', () => {
    expect(tar.TokenAdminRegistry_TokenInfo.PREFIX).toBe(crc32('TokenAdminRegistry_TokenInfo'))
  })
})

describe('TokenAdminRegistry - Unit Tests', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  it('should match facility name and error codes', () => {
    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
    expect(RegistryErrors['TokenAdminRegistry_Error.UnauthorizedEntry']).toBe(ERROR_CODE)
    expect(RegistryErrors['TokenAdminRegistry_Error.InsufficientValue']).toBe(ERROR_CODE + 1)
  })

  it('should derive event topics from the event names', () => {
    expect(EventTopics.AdministratorTransferRequested).toBe(crc32('AdministratorTransferRequested'))
    expect(EventTopics.AdministratorTransferred).toBe(crc32('AdministratorTransferred'))
    expect(EventTopics.PoolSet).toBe(crc32('PoolSet'))
  })

  it('reports owner and no pending owner after deployment', async () => {
    expect(await fx.registry.getOwner()).toEqualAddress(fx.owner.address)
    expect(await fx.registry.getPendingOwner()).toBeNull()
  })

  it('rejects an owner upgrade without a migration path from the current version', async () => {
    await registerToken(fx)
    const before = await accountState(fx, fx.registry.address)

    const result = await fx.registry.sendUpgradeableUpgrade(fx.owner.getSender(), OPERATION_VALUE, {
      code: before.code,
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.owner.address,
      to: fx.registry.address,
      success: false,
      exitCode: upgradeable.Error.VersionMismatch,
    })

    expect(await accountState(fx, fx.registry.address)).toEqual(before)
  })

  it('accepts empty-body top ups', async () => {
    const result = await fx.other.send({
      to: fx.registry.address,
      value: toNano('0.05'),
      body: beginCell().endCell(),
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: fx.registry.address,
      success: true,
    })
  })

  it('rejects unknown opcodes', async () => {
    const result = await fx.other.send({
      to: fx.registry.address,
      value: toNano('0.05'),
      body: beginCell().storeUint(0xdeadbeef, 32).storeUint(0, 64).endCell(),
    })
    expect(result.transactions).toHaveTransaction({
      from: fx.other.address,
      to: fx.registry.address,
      success: false,
      exitCode: 0xffff,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_unit_tests',
        await coverageConfig(),
      )
    }
  })
})
