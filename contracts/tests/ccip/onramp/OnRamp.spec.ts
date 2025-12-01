import { compile } from '@ton/blueprint'
import { OnRamp } from '../../../wrappers/ccip/OnRamp'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'
import { CHAINSEL_TON, deployOnRampContract, setup } from './OnRamp.Setup'
import * as coverage from '../../coverage/coverage'

describe('OnRamp - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: OnRamp.type(),
    version: OnRamp.version(),
    deployContract: deployOnRampContract,
  })
  currentVersionSpec.run()
})

describe('OnRamp - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('OnRamp'),
    ContractConstructor: OnRamp,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployOnRampContract,
  })
  withdrawableSpec.run([
    {
      code: 'OnRamp',
      name: 'onramp',
    },
  ])
})

// TODO when we have a new version
// describe('OnRamp - Upgrade Tests', () => {
//   const upgradeSpec = UpgradeableSpec.newUpgradeSpec(
//     {
//       contractType: OnRampPrev.type(),
//       prevVersion: OnRampPrev.version(),
//       currentVersion: OnRamp.version(),
//       getPrevCode: () => OnRampPrev.code(),
//       getCurrentCode: () => OnRamp.code(),
//       CurrentVersionConstructor: OnRamp,
//     },
//     async (blockchain, owner) => {
//       const codeV1 = await OnRampPrev.code()
//       const data = {} as any // TODO fill with valid data
//       const contract = blockchain.openContract(
//         OnRampPrev.createFromConfig(
//           data,
//           codeV1,
//         ),
//       )
//       const deployer = await blockchain.treasury('deployer')
//       await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
//       return contract
//     },
//   )
//   upgradeSpec.run()
// })

describe('OnRamp - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const onramp = await deployOnRampContract(blockchain, deployer)

    await ownable2StepSpec.ownable2StepSpec(deployer, other, onramp, blockchain, [
      {
        code: await onramp.getCode(),
        name: 'onramp',
      },
    ])
  })
})

describe('OnRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: OnRamp.type(),
    currentVersion: OnRamp.version(),
    getCurrentCode: () => OnRamp.code(),
    CurrentVersionConstructor: OnRamp,
    deployCurrentContract: deployOnRampContract,
  })
  currentVersionSpec.run()
})

describe('OnRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<OnRamp>

  beforeEach(async () => {
    ;({ blockchain, deployer, onramp } = await setup())
  })

  it('getStaticConfig should return chain selector', async () => {
    const result = await onramp.getStaticConfig()
    expect(result).toBe(CHAINSEL_TON)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      coverage.generateCoverageArtifacts(blockchain, 'onramp_unit_tests', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
