import { compile } from '@ton/blueprint'
import { OnRamp, OnRampStorage } from '../../../wrappers/ccip/OnRamp'
import { beginCell, Dictionary, toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { ZERO_ADDRESS } from '../../../src/utils'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'

async function deployOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await OnRamp.code()
  let data: OnRampStorage = {
    id: 0,
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    chainSelector: CHAINSEL_TON,
    config: {
      feeQuoter: ZERO_ADDRESS,
      feeAggregator: ZERO_ADDRESS,
      allowlistAdmin: ZERO_ADDRESS,
    },
    destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
    executor: {
      deployableCode: beginCell().endCell(),
      executorCode: beginCell().endCell(),
      currentID: 0n,
    },
  }
  // TODO: use deployable to make deterministic?
  const contract = blockchain.openContract(OnRamp.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}

const CHAINSEL_TON = 13879075125137744094n // TODO repeated constant

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
  withdrawableSpec.run()
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
    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const onramp = await deployOnRampContract(blockchain, deployer)

    await ownable2StepSpec.ownable2StepSpec(deployer, other, onramp)
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
