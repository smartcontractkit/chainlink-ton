import { compile } from '@ton/blueprint'
import { OnRamp, OnRampStorage } from '../../../wrappers/ccip/OnRamp'
import { beginCell, Dictionary, toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
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
