import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { crc32 } from 'zlib'
import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'
import { contractCode } from '../../../wrappers/codeLoader'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import { ownable2StepSpec } from '../../lib/access/Ownable2StepSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as rt from '../../../wrappers/gen/ccip/Router'
import {
  FACILITY_NAME,
  ROUTER_CONTRACT_VERSION,
  SUPPORTED_PREV_VERSIONS,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/Router'
import { contractsCoverageConfig, deployRouterContract, setup } from './Router.Setup'
import { toNano } from '@ton/core'

describe('rt.Router - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: ROUTER_CONTRACT_VERSION,
    deployContract: deployRouterContract,
  })

  currentVersionSpec.run([
    {
      code: 'Router',
      name: 'router',
    },
  ])
})

describe('Router - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => contractCode.ccip.local('Router'),
    ContractConstructor: rt.Router.fromAddress,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployRouterContract,
  })
  withdrawableSpec.run([
    {
      code: 'Router',
      name: 'router',
    },
  ])
})

describe('Router - Upgrade Tests', () => {
  class Router extends rt.Router {}

  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: FACILITY_NAME,
    prevVersionConfigs: Object.entries(SUPPORTED_PREV_VERSIONS).map(([version, getCode]) => ({
      version,
      getCode,
      deploy: async (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
        deployRouterContract(blockchain, owner, await getCode()),
    })),
    currentVersion: ROUTER_CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('Router'),
    CurrentVersionConstructor: Router.fromAddress,
    upgradeValue: toNano('0.05'),
  })
  upgradeSpec.run([
    {
      code: 'Router',
      name: 'router',
    },
  ])
})

describe('Router - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: FACILITY_NAME,
    currentVersion: ROUTER_CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('Router'),
    CurrentVersionConstructor: rt.Router.fromAddress,
    deployCurrentContract: deployRouterContract,
  })
  currentVersionSpec.run('router')
})

describe('Router - Ownable Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

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
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
  })

  beforeEach(async () => {
    const res = await setup(blockchain, { feeQuoter, onRamp })
    ;({ deployer, sender, router } = res)
  })

  it('supports ownable messages', async () => {
    const other = await blockchain.treasury('other')
    await ownable2StepSpec(deployer, other, router, {
      coverage: {
        blockchain,
        conf: [
          {
            code: 'Router',
            name: 'router',
          },
        ],
      },
    })
  })

  it('supports RMN ownable messages', async () => {
    const other = await blockchain.treasury('other')
    await ownable2StepSpec(deployer, other, router, {
      coverage: {
        blockchain,
        conf: [
          {
            code: 'Router',
            name: 'router',
          },
        ],
      },
    })
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await router.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await router.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)

    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await router.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_ownable',
        await contractsCoverageConfig(),
      )
    }
  })
})
