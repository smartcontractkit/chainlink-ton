import { compile } from '@ton/blueprint'
import { FeeQuoter } from '../../../wrappers/ccip/FeeQuoter'
import { setupTestFeeQuoter } from '../helpers/SetUp'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import { Blockchain } from '@ton/sandbox'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('FeeQuoter'),
    ContractConstructor: FeeQuoter,
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
    type: FeeQuoter.type(),
    version: FeeQuoter.version(),
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

// TODO when we have a new version
// describe('FeeQuoter - Upgrade Tests', () => {
//   const upgradeSpec = UpgradeableSpec.newUpgradeSpec(
//     {
//       contractType: FeeQuoterPrev.type(),
//       prevVersion: FeeQuoterPrev.version(),
//       currentVersion: FeeQuoter.version(),
//       getPrevCode: () => FeeQuoterPrev.code(),
//       getCurrentCode: () => FeeQuoter.code(),
//       CurrentVersionConstructor: FeeQuoter,
//     },
//     async (blockchain, owner) => {
//       const codeV1 = await FeeQuoterPrev.code()
//       const data = {} as any // TODO fill with valid data
//       const contract = blockchain.openContract(
//         FeeQuoterPrev.createFromConfig(
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

describe('FeeQuoter - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    await ownable2StepSpec.ownable2StepSpec(deployer, other, feeQuoter, blockchain, [
      {
        code: await feeQuoter.getCode(),
        name: 'feequoter',
      },
    ])
  })
})

describe('FeeQuoter - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: FeeQuoter.type(),
    currentVersion: FeeQuoter.version(),
    getCurrentCode: () => FeeQuoter.code(),
    CurrentVersionConstructor: FeeQuoter,
    deployCurrentContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  currentVersionSpec.run()
})
