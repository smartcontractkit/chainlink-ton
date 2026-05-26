import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId } from '../../../src/utils'
import * as or from '../../../wrappers/ccip/OnRamp'
import { randomAddress } from '@ton/test-utils'

type OnRampOverrides = Partial<Omit<or.OnRampStorage, 'config' | 'executor' | 'ownable'>> & {
  config?: Partial<or.OnRampStorage['config']>
  executor?: Partial<or.OnRampStorage['executor']>
  ownable?: Partial<or.OnRampStorage['ownable']>
}

export const CHAINSEL_EVM_TEST = 909606746561742123n
export const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n
export const CHAINSEL_TON = 13879075125137744094n // TODO repeated constant

// Deprecated, use deployOnRampContractW instead for more flexibility in tests. Will be removed in a future version.
// TODO: refactor existing tests to use deployOnRampContractW and remove this function.
export async function deployOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides: OnRampOverrides = {},
) {
  return deployOnRampContractW(blockchain, owner, { overrides })
}

export async function deployOnRampContractW(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  opt: {
    code?: Cell
    overrides?: OnRampOverrides
  } = {},
) {
  const code = opt.code ?? (await or.OnRamp.code())
  const defaults: or.OnRampStorage = {
    id: generateRandomContractId(),
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    chainSelector: CHAINSEL_TON,
    config: {
      feeQuoter: randomAddress(),
      feeAggregator: (await blockchain.treasury('fee-aggregator')).address,
      allowlistAdmin: owner.address,
      reserve: toNano('0.05'),
    },
    destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
    executor: {
      deployableCode: beginCell().endCell(),
      executorCode: beginCell().endCell(),
    },
  }

  const config = {
    ...defaults.config,
    ...(opt.overrides?.config ?? {}),
  }

  const data: or.OnRampStorage = {
    ...defaults,
    ...(opt.overrides ?? {}),
    ownable: {
      ...defaults.ownable,
      ...(opt.overrides?.ownable ?? {}),
    },
    config,
    executor: {
      ...defaults.executor,
      ...(opt.overrides?.executor ?? {}),
    },
  }
  const onramp = blockchain.openContract(or.OnRamp.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await onramp.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { onramp, config }
}

export async function setup(blockchain: Blockchain, overrides: OnRampOverrides = {}) {
  const deployer = await blockchain.treasury('deployer')
  const { onramp, config } = await deployOnRampContract(blockchain, deployer, overrides)
  return { deployer, onramp, config }
}
