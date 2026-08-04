import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
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
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployOffRampContract } from './OffRamp.Setup'

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
