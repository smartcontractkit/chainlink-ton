import { compile } from '@ton/blueprint'
import { FeeQuoter } from '../../../wrappers/ccip/FeeQuoter'
import { setupTestFeeQuoter } from '../helpers/SetUp'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('FeeQuoter'),
    ContractConstructor: FeeQuoter,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  withdrawableSpec.run()
})

const CHAINSEL_TON = 13879075125137744094n // TODO this is copy/pasted from CCIPRouter.spec.ts. Isn't there a chainlink package that exports this constant?

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
