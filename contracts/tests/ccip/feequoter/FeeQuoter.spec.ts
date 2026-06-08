import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import { setupTestFeeQuoter } from '../helpers/SetUp'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import { Cell, toNano } from '@ton/core'
import { contractCode } from '../../../wrappers/codeLoader'
import { FEE_QUOTER_SUPPORTED_PREV_VERSIONS } from '../../../wrappers/ccip/FeeQuoter'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => contractCode.ccip.local('FeeQuoter'),
    ContractConstructor: fq.FeeQuoter,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  withdrawableSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

describe('FeeQuoter - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: fq.FeeQuoter.type(),
    version: fq.FeeQuoter.version(),
    deployContract: async (blockchain, deployer) => {
      return setupTestFeeQuoter(deployer, blockchain)
    },
  })
  currentVersionSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

describe('FeeQuoter - Upgrade Tests', () => {
  class FeeQuoter extends fq.FeeQuoter {}

  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: fq.FeeQuoter.type(),
    prevVersionConfigs: Object.entries(fq.SUPPORTED_PREV_VERSIONS).map(([version, getCode]) => ({
      version,
      getCode,
      deploy: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain, await getCode()),
    })),
    currentVersion: FeeQuoter.version(),
    getCurrentCode: () => FeeQuoter.code(),
    CurrentVersionConstructor: FeeQuoter,
    upgradeValue: toNano('0.05'),
  })
  upgradeSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

describe('FeeQuoter - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    await ownable2StepSpec.ownable2StepSpec(deployer, other, feeQuoter, {
      coverage: {
        blockchain,
        conf: [
          {
            code: await feeQuoter.getCode(),
            name: 'feequoter',
          },
        ],
      },
    })
  })
})

describe('FeeQuoter - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: fq.FeeQuoter.type(),
    currentVersion: fq.FeeQuoter.version(),
    getCurrentCode: () => fq.FeeQuoter.code(),
    CurrentVersionConstructor: fq.FeeQuoter,
    deployCurrentContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  currentVersionSpec.run('feequoter')
})

describe('FeeQuoter - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let feeQuoter: SandboxContract<fq.FeeQuoter>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    deployer = await blockchain.treasury('deployer')
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await feeQuoter.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(fq.FACILITY_ID))

    const { type } = await feeQuoter.getTypeAndVersion()
    expect(type).toBe(fq.FACILITY_NAME)

    expect(fq.FACILITY_ID).toEqual(facilityId(crc32(fq.FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await feeQuoter.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(fq.ERROR_CODE))

    expect(fq.ERROR_CODE).toEqual(errorCode(crc32(fq.FACILITY_NAME)))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'feequoter_unit_tests', [
        {
          code: await fq.FeeQuoter.code(),
          name: 'feequoter',
        },
      ])
    }
  })
})
