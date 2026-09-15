import { Address, Cell, beginCell, contractAddress, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId } from '../../../src/utils'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import { contractCode } from '../../../wrappers/codeLoader'
import { randomAddress } from '@ton/test-utils'
import { ChainSelectors } from '../../utils/Selectors'

type OnRampOverrides = Partial<
  Omit<or.OnRamp_Storage, '$' | 'config' | 'staticConfig' | 'ownable'>
> & {
  config?: Partial<Omit<or.OnRamp_DynamicConfig, '$'>>
  staticConfig?: Partial<Omit<or.OnRamp_StaticConfig, '$'>>
  tokenAdminRegistry?: Address
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
    staticConfig: or.OnRamp_StaticConfig.create({
      chainSelector: ChainSelectors.testnet.ton,
      tokenAdminRegistry: randomAddress(),
    }),
    config: or.OnRamp_DynamicConfig.create({
      feeQuoter: randomAddress(),
      feeAggregator: (await blockchain.treasury('fee-aggregator')).address,
      allowlistAdmin: owner.address,
      reserve: toNano('0.05'),
    }),
    destChainConfigs: new Map(),
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
    staticConfig: or.OnRamp_StaticConfig.create({
      ...defaults.staticConfig,
      ...(opt.overrides?.staticConfig ?? {}),
      tokenAdminRegistry:
        opt.overrides?.tokenAdminRegistry ?? defaults.staticConfig.tokenAdminRegistry,
    }),
  })
  const onramp = blockchain.openContract(
    or.OnRamp.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await onramp.sendDeploy(deployer.getSender(), toNano('0.1'))
  return { onramp, config }
}

// This layout matches the deployed 1.6.0 OnRamp. Keep it here rather than in
// generated bindings so the upgrade test exercises the persisted release data.
export async function deployLegacyOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  code: Cell,
): Promise<SandboxContract<or.OnRamp>> {
  const config = or.OnRamp_DynamicConfig.create({
    feeQuoter: owner.address,
    feeAggregator: owner.address,
    allowlistAdmin: owner.address,
    reserve: toNano('0.05'),
  })
  const deployablesConfig = beginCell()
    .storeRef(beginCell().endCell())
    .storeRef(beginCell().endCell())
    .storeAddress(owner.address)
    .endCell()
  const data = beginCell()
  data.storeUint(generateRandomContractId(), 32)
  or.Ownable2Step.store(or.Ownable2Step.create({ owner: owner.address, pendingOwner: null }), data)
  data.storeUint(ChainSelectors.testnet.ton, 64)
  data.storeRef(or.OnRamp_DynamicConfig.toCell(config))
  data.storeDict(null)
  data.storeRef(deployablesConfig)

  const init = { code, data: data.endCell() }
  const onramp = blockchain.openContract(or.OnRamp.fromAddress(contractAddress(0, init)))
  const result = await owner.send({
    to: onramp.address,
    value: toNano('0.1'),
    init,
    body: beginCell().endCell(),
  })
  expect(result.transactions).toHaveTransaction({
    from: owner.address,
    to: onramp.address,
    deploy: true,
    success: true,
  })
  return onramp
}

export async function setup(blockchain: Blockchain, overrides: OnRampOverrides = {}) {
  const deployer = await blockchain.treasury('deployer')
  const { onramp, config } = await deployOnRampContract(blockchain, deployer, overrides)
  return { deployer, onramp, config }
}
