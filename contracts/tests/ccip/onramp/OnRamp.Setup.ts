import { Address, Dictionary, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { ZERO_ADDRESS } from '../../../src/utils'
import { OnRamp, OnRampStorage } from '../../../wrappers/ccip/OnRamp'

type OnRampOverrides = Partial<Omit<OnRampStorage, 'config' | 'executor' | 'ownable'>> & {
  config?: Partial<OnRampStorage['config']>
  executor?: Partial<OnRampStorage['executor']>
  ownable?: Partial<OnRampStorage['ownable']>
}

export const CHAINSEL_EVM_TEST = 909606746561742123n
export const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n
export const CHAINSEL_TON = 13879075125137744094n // TODO repeated constant

export function generateSecureRandomId(): number {
  return Math.floor(Math.random() * 0x100000000) // 2^32
}
export async function deployOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides: OnRampOverrides = {},
) {
  const code = await OnRamp.code()
  const defaults: OnRampStorage = {
    id: generateSecureRandomId(),
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
  const data: OnRampStorage = {
    ...defaults,
    ...overrides,
    ownable: {
      ...defaults.ownable,
      ...(overrides.ownable ?? {}),
    },
    config: {
      ...defaults.config,
      ...(overrides.config ?? {}),
    },
    executor: {
      ...defaults.executor,
      ...(overrides.executor ?? {}),
    },
  }
  const contract = blockchain.openContract(OnRamp.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}

export async function setup() {
  const blockchain = await Blockchain.create()
  blockchain.verbosity.debugLogs = true
  const deployer = await blockchain.treasury('deployer')
  const onramp = await deployOnRampContract(blockchain, deployer)
  return { blockchain, deployer, onramp }
}

export function assertAddressesMatch(expected: Address[], actual: Address[]) {
  expect(actual.map((x) => x.toString()).sort()).toEqual(
    expected
      .map((x) => {
        return x.toString()
      })
      .sort(),
  )
}
