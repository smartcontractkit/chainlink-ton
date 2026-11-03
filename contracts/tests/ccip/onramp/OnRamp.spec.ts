import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as Ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import {
  FACILITY_NAME,
  CONTRACT_VERSION,
  SUPPORTED_PREV_VERSIONS,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/OnRamp'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployLegacyOnRampContract, deployOnRampContract, setup } from './OnRamp.Setup'
import { ChainSelectors } from '../../utils/Selectors'
import { ZERO_ADDRESS } from '../../../src/utils'

describe('OnRamp - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
    deployContract: (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
      deployOnRampContract(blockchain, owner).then((c) => c.onramp),
  })
  currentVersionSpec.run([
    {
      code: 'OnRamp',
      name: 'onramp',
    },
  ])
})

describe('OnRamp - Upgrade Tests', () => {
  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: FACILITY_NAME,
    prevVersionConfigs: Object.entries(SUPPORTED_PREV_VERSIONS).map(([version, getCode]) => ({
      version,
      getCode,
      deploy: async (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
        deployLegacyOnRampContract(blockchain, owner, await getCode()),
    })),
    currentVersion: CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('OnRamp'),
    CurrentVersionConstructor: or.OnRamp.fromAddress,
    upgradeValue: toNano('0.05'),
    verifyMigration: async (onramp, owner) => {
      const staticConfig = await onramp.getStaticConfig()
      expect(staticConfig.chainSelector).toBe(ChainSelectors.testnet.ton)
      expect(staticConfig.tokenAdminRegistry).toEqualAddress(ZERO_ADDRESS)

      const dynamicConfig = await onramp.getDynamicConfig()
      expect(dynamicConfig.feeQuoter).toEqualAddress(owner.address)
      expect(dynamicConfig.feeAggregator).toEqualAddress(owner.address)
      expect(dynamicConfig.allowlistAdmin).toEqualAddress(owner.address)
      expect(dynamicConfig.reserve).toBe(toNano('0.05'))
    },
  })
  upgradeSpec.run([
    {
      code: 'OnRamp',
      name: 'onramp',
    },
  ])
})

describe('OnRamp - SetTokenAdminRegistry after migration', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    owner = await blockchain.treasury('owner')
    const legacy = await deployLegacyOnRampContract(
      blockchain,
      owner,
      await SUPPORTED_PREV_VERSIONS['1.6.0'](),
    )
    onramp = blockchain.openContract(or.OnRamp.fromAddress(legacy.address))
    const result = await onramp.sendUpgradeableUpgrade(owner.getSender(), toNano('0.05'), {
      code: await contractCode.ccip.local('OnRamp'),
    })
    expect(result.transactions).toHaveTransaction({ to: onramp.address, success: true })
  })

  it('lets the owner set the registry exactly once', async () => {
    const registry = (await blockchain.treasury('registry')).address
    const set = await onramp.sendOnRampSetTokenAdminRegistry(owner.getSender(), toNano('0.05'), {
      tokenAdminRegistry: registry,
    })
    expect(set.transactions).toHaveTransaction({ to: onramp.address, success: true })
    expect((await onramp.getStaticConfig()).tokenAdminRegistry).toEqualAddress(registry)

    const again = await onramp.sendOnRampSetTokenAdminRegistry(owner.getSender(), toNano('0.05'), {
      tokenAdminRegistry: owner.address,
    })
    expect(again.transactions).toHaveTransaction({
      to: onramp.address,
      success: false,
      exitCode: Number(or.OnRamp.Errors['OnRamp_Error.TokenAdminRegistryAlreadySet']),
    })
    expect((await onramp.getStaticConfig()).tokenAdminRegistry).toEqualAddress(registry)
  })

  it('rejects the zero address', async () => {
    const result = await onramp.sendOnRampSetTokenAdminRegistry(owner.getSender(), toNano('0.05'), {
      tokenAdminRegistry: ZERO_ADDRESS,
    })
    expect(result.transactions).toHaveTransaction({
      to: onramp.address,
      success: false,
      exitCode: Number(or.OnRamp.Errors['OnRamp_Error.InvalidConfig']),
    })
  })

  it('rejects non-owners', async () => {
    const other = await blockchain.treasury('other')
    const result = await onramp.sendOnRampSetTokenAdminRegistry(other.getSender(), toNano('0.05'), {
      tokenAdminRegistry: other.address,
    })
    expect(result.transactions).toHaveTransaction({ to: onramp.address, success: false })
    expect((await onramp.getStaticConfig()).tokenAdminRegistry).toEqualAddress(ZERO_ADDRESS)
  })
})

describe('OnRamp - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const { onramp } = await deployOnRampContract(blockchain, deployer)

    await Ownable2StepSpec.ownable2StepSpec(deployer, other, onramp, {
      coverage: {
        blockchain,
        conf: [
          {
            code: await contractCode.ccip.local('OnRamp'),
            name: 'onramp',
          },
        ],
      },
    })
  })
})

describe('OnRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: FACILITY_NAME,
    currentVersion: CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('OnRamp'),
    CurrentVersionConstructor: or.OnRamp.fromAddress,
    deployCurrentContract: (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
      deployOnRampContract(blockchain, owner).then((c) => c.onramp),
  })
  currentVersionSpec.run('onramp')
})

describe('OnRamp - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(or.OnRamp_Send.PREFIX).toBe(crc32('OnRamp_Send'))
    expect(or.OnRamp_GetValidatedFee.PREFIX).toBe(crc32('OnRamp_GetValidatedFee'))
    expect(or.OnRamp_ExecutorFinishedSuccessfully.PREFIX).toBe(
      crc32('OnRamp_ExecutorFinishedSuccessfully'),
    )
    expect(or.OnRamp_ExecutorFinishedWithError.PREFIX).toBe(
      crc32('OnRamp_ExecutorFinishedWithError'),
    )
    expect(or.OnRamp_SetDynamicConfig.PREFIX).toBe(crc32('OnRamp_SetDynamicConfig'))
    expect(or.OnRamp_UpdateDestChainConfigs.PREFIX).toBe(crc32('OnRamp_UpdateDestChainConfigs'))
    expect(or.OnRamp_UpdateAllowlists.PREFIX).toBe(crc32('OnRamp_UpdateAllowlists'))
    expect(or.OnRamp_WithdrawFeeTokens.PREFIX).toBe(crc32('OnRamp_WithdrawFeeTokens'))
  })

  it('should match out opcodes', () => {
    expect(or.OnRamp_MessageValidated.PREFIX).toBe(crc32('OnRamp_MessageValidated'))
    expect(or.OnRamp_MessageValidationFailed.PREFIX).toBe(crc32('OnRamp_MessageValidationFailed'))
  })
})

describe('OnRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    ;({ deployer, onramp } = await setup(blockchain))
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await onramp.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await onramp.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)

    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await onramp.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })

  it('getStaticConfig should return static configuration', async () => {
    const result = await onramp.getStaticConfig()
    expect(result.chainSelector).toBe(ChainSelectors.testnet.ton)
  })

  it('reports the inlined send executor code and hash', async () => {
    const executorCode = await onramp.getSendExecutorCode()
    expect(executorCode).toEqual(await contractCode.ccip.local('CCIPSendExecutor'))
    const executorCodeHash = await onramp.getSendExecutorCodeHash()
    expect(executorCodeHash).toBe(BigInt('0x' + executorCode.hash().toString('hex')))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_unit_tests', [
        {
          code: await contractCode.ccip.local('OnRamp'),
          name: 'onramp',
        },
      ])
    }
  })
})
