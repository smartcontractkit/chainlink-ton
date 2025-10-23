import { compile } from '@ton/blueprint'
import { OnRamp, OnRampStorage } from '../../../wrappers/ccip/OnRamp'
import { beginCell, Dictionary, toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { ZERO_ADDRESS } from '../../../src/utils'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

const CHAINSEL_TON = 13879075125137744094n // TODO repeated constant

describe('OnRamp - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('OnRamp'),
    ContractConstructor: OnRamp,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => {
      const code = await compile('OnRamp')
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
        currentMessageId: 0n,
        executor_code: beginCell().endCell(),
      }
      // TODO: use deployable to make deterministic?
      const contract = blockchain.openContract(OnRamp.createFromConfig(data, code))
      const deployer = await blockchain.treasury('deployer')
      await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
      return contract
    },
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

describe('OnRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: OnRamp.type(),
    currentVersion: OnRamp.version(),
    getCurrentCode: () => OnRamp.code(),
    CurrentVersionConstructor: OnRamp,
    deployCurrentContract: async (blockchain, owner) => {
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
        currentMessageId: 0n,
        executor_code: beginCell().endCell(),
      }
      // TODO: use deployable to make deterministic?
      const contract = blockchain.openContract(OnRamp.createFromConfig(data, code))
      const deployer = await blockchain.treasury('deployer')
      await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
      return contract
    },
  })
  currentVersionSpec.run()
})
