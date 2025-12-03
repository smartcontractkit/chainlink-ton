import { Dictionary, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { generateRandomContractId, ZERO_ADDRESS } from '../../../src/utils'
import { OnRamp, OnRampStorage } from '../../../wrappers/ccip/OnRamp'

export const CHAINSEL_EVM_TEST = 909606746561742123n
export const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n

export async function deployOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides = {},
) {
  const code = await OnRamp.code()
  let data: OnRampStorage = {
    id: generateRandomContractId(),
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
    ...overrides,
  }
  // TODO: use deployable to make deterministic?
  const contract = blockchain.openContract(OnRamp.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}
export const CHAINSEL_TON = 13879075125137744094n // TODO repeated constant
