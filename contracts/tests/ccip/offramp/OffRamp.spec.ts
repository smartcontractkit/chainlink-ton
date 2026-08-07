import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import {
  FACILITY_NAME,
  OFFRAMP_CONTRACT_VERSION,
  SUPPORTED_PREV_VERSIONS,
  ARTIFACT_NAME,
} from '../../../wrappers/ccip/OffRamp'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as ownable2StepSpec from '../../lib/access/Ownable2StepSpec'

import { contractCode } from '../../../wrappers/codeLoader'
import { deployOffRampContract } from './OffRamp.Setup'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as ofManual from '../../../wrappers/ccip/OffRamp'
import { generateMockTonAddress } from '../../../src/utils'
import { errorCode, facilityId } from '../../../wrappers/utils'
import { crc32 } from 'zlib'

describe('OffRamp - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: OFFRAMP_CONTRACT_VERSION,
    deployContract: deployOffRampContract,
  })
  currentVersionSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => contractCode.ccip.local('OffRamp'),
    ContractConstructor: of.OffRamp.fromAddress,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployOffRampContract,
  })
  withdrawableSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Upgrade Tests', () => {
  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: FACILITY_NAME,
    prevVersionConfigs: Object.entries(SUPPORTED_PREV_VERSIONS).map(([version, getCode]) => ({
      version,
      getCode,
      deploy: async (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
        deployOffRampContract(blockchain, owner, await getCode()),
    })),
    currentVersion: OFFRAMP_CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local(ARTIFACT_NAME),
    CurrentVersionConstructor: of.OffRamp.fromAddress,
    upgradeValue: toNano('0.05'),
  })
  upgradeSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: FACILITY_NAME,
    currentVersion: OFFRAMP_CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local(ARTIFACT_NAME),
    CurrentVersionConstructor: of.OffRamp.fromAddress,
    deployCurrentContract: deployOffRampContract,
  })
  currentVersionSpec.run('offramp')
})

describe('OffRamp - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const offRamp = await deployOffRampContract(
      blockchain,
      deployer,
      await contractCode.ccip.local('OffRamp'),
      {
        deployerCode: Cell.EMPTY, //await contractCode.ccip.local('Deployable'),
        merkleRootCode: Cell.EMPTY, //await contractCode.ccip.local('MerkleRoot'),
        receiveExecutorCode: Cell.EMPTY, //await contractCode.ccip.local('ReceiveExecutor'),
        feeQuoter: generateMockTonAddress(),
      },
    )

    await ownable2StepSpec.ownable2StepSpec(deployer, other, offRamp, {
      coverage: {
        blockchain,
        conf: [
          {
            code: await contractCode.ccip.local('OffRamp'),
            name: 'offramp',
          },
        ],
      },
    })
  })

  describe('OffRamp - Commit and Execute', () => {
    let blockchain: Blockchain
    let offRamp: SandboxContract<of.OffRamp>

    beforeAll(async () => {
      blockchain = await Blockchain.create()
      if (process.env['COVERAGE'] === 'true') {
        blockchain.enableCoverage()
        blockchain.verbosity.print = false
        blockchain.verbosity.vmLogs = 'vm_logs_verbose'
      }
      blockchain.now = 10000
      offRamp = await deployOffRampContract(
        blockchain,
        await blockchain.treasury('deployer'),
        await contractCode.ccip.local('OffRamp'),
      )
    })

    it('OffRamp should match facility name and ID', async () => {
      const facilityIdVal = await offRamp.getFacilityId()
      expect(facilityIdVal).toBe(BigInt(ofManual.FACILITY_ID))

      const [typeSlice] = await offRamp.getTypeAndVersion()
      const typeStr = typeSlice.loadStringTail()
      expect(typeStr).toBe(ofManual.FACILITY_NAME)

      expect(ofManual.FACILITY_ID).toEqual(facilityId(crc32(ofManual.FACILITY_NAME)))
    })

    it('OffRamp should match error code', async () => {
      const errorCodeVal = await offRamp.getErrorCode(0n)
      expect(errorCodeVal).toBe(BigInt(ofManual.ERROR_CODE))

      expect(ofManual.ERROR_CODE).toEqual(errorCode(crc32(ofManual.FACILITY_NAME)))
    })
  })
})
