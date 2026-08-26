import { Cell, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId } from '../../../src/utils'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import { contractCode } from '../../../wrappers/codeLoader'
import { randomAddress } from '@ton/test-utils'
import { ChainSelectors } from '../../utils/Selectors'

type OnRampOverrides = Partial<Omit<or.OnRamp_Storage, '$' | 'config' | 'executor' | 'ownable'>> & {
  config?: Partial<Omit<or.OnRamp_DynamicConfig, '$'>>
  executor?: Partial<Omit<or.ExecutorDeployment, '$'>>
  ownable?: Partial<Omit<or.Ownable2Step, '$'>>
}

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
  const code = opt.code ?? (await contractCode.ccip.local('OnRamp'))
  const defaults = {
    id: generateRandomContractId(),
    ownable: or.Ownable2Step.create({
      owner: owner.address,
      pendingOwner: null,
    }),
    chainSelector: ChainSelectors.testnet.ton,
    config: or.OnRamp_DynamicConfig.create({
      feeQuoter: randomAddress(),
      feeAggregator: (await blockchain.treasury('fee-aggregator')).address,
      allowlistAdmin: owner.address,
      reserve: toNano('0.05'),
    }),
    destChainConfigs: new Map(),
    executor: or.ExecutorDeployment.create({
      deployableCode: beginCell().endCell(),
      executorCode: beginCell().endCell(),
    }),
  }

  const config = or.OnRamp_DynamicConfig.create({
    ...defaults.config,
    ...(opt.overrides?.config ?? {}),
  })

  const data = or.OnRamp_Storage.create({
    ...defaults,
    ...(opt.overrides ?? {}),
    ownable: or.Ownable2Step.create({
      ...defaults.ownable,
      ...(opt.overrides?.ownable ?? {}),
    }),
    config,
    executor: or.ExecutorDeployment.create({
      ...defaults.executor,
      ...(opt.overrides?.executor ?? {}),
    }),
  })
  const onramp = blockchain.openContract(
    or.OnRamp.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await onramp.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { onramp, config }
}

export async function setup(blockchain: Blockchain, overrides: OnRampOverrides = {}) {
  const deployer = await blockchain.treasury('deployer')
  const { onramp, config } = await deployOnRampContract(blockchain, deployer, overrides)
  return { deployer, onramp, config }
}
