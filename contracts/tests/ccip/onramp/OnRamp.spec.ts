import { compile } from '@ton/blueprint'
import { OnRamp, OnRampStorage, UpdateAllowlists } from '../../../wrappers/ccip/OnRamp'
import { Address, beginCell, Dictionary, toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { generateRandomTonAddress, ZERO_ADDRESS } from '../../../src/utils'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'

const CHAINSEL_EVM_TEST = 909606746561742123n
const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n

function generateSecureRandomId(): number {
  return Math.floor(Math.random() * 0x100000000) // 2^32
}

async function deployOnRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides = {},
) {
  const code = await OnRamp.code()
  let data: OnRampStorage = {
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
    ...overrides,
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

describe('OnRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<OnRamp>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    onramp = await deployOnRampContract(blockchain, deployer)
  })

  //TODO we really need to increase onramp coverage
  it('Test allowlist admin can call updateAllowlist ', async () => {
    const allowlistAdmin = await blockchain.treasury('allowlistAdmin')
    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: ZERO_ADDRESS,
        feeAggregator: ZERO_ADDRESS,
        allowlistAdmin: allowlistAdmin.address,
      },
    })

    const randomAddressForRouter = await generateRandomTonAddress()
    const resultUpdateDestChainConfigs = await onramp.sendUpdateDestChainConfigs(
      deployer.getSender(),
      {
        value: toNano('0.5'),
        destChainConfigs: [
          {
            destChainSelector: CHAINSEL_EVM_TEST,
            router: randomAddressForRouter,
            allowlistEnabled: true,
          },
          {
            destChainSelector: CHAINSEL_EVM_TEST_90000002,
            router: randomAddressForRouter,
            allowlistEnabled: true,
          },
        ],
      },
    )
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    const randomAddresses = [
      await generateRandomTonAddress(),
      await generateRandomTonAddress(),
      await generateRandomTonAddress(),
      await generateRandomTonAddress(),
    ]

    const updateAllowlists: UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: [randomAddresses[0], randomAddresses[1]],
          remove: [],
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          add: [randomAddresses[2], randomAddresses[3]],
          remove: [],
        },
      ],
    }
    const result = await onramp.sendUpdateAllowlists(deployer.getSender(), {
      value: toNano('0.5'),
      updateAllowlists,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    const resultCheckAdd1 = await onramp.getAllowedSendersList(CHAINSEL_EVM_TEST)
    assertAddressesMatch([randomAddresses[0], randomAddresses[1]], resultCheckAdd1)

    const resultCheckAdd2 = await onramp.getAllowedSendersList(CHAINSEL_EVM_TEST_90000002)
    assertAddressesMatch([randomAddresses[2], randomAddresses[3]], resultCheckAdd2)

    const updateAllowlists2: UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: [],
          remove: [randomAddresses[0], randomAddresses[1]],
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          add: [],
          remove: [randomAddresses[2], randomAddresses[3]],
        },
      ],
    }

    const result2 = await onramp.sendUpdateAllowlists(allowlistAdmin.getSender(), {
      value: toNano('0.5'),
      updateAllowlists: updateAllowlists2,
    })
    expect(result2.transactions).toHaveTransaction({
      from: allowlistAdmin.address,
      to: onramp.address,
      success: true,
    })

    const resultCheckRemove1 = await onramp.getAllowedSendersList(CHAINSEL_EVM_TEST)
    expect(resultCheckRemove1).toEqual([])

    const resultCheckRemove2 = await onramp.getAllowedSendersList(CHAINSEL_EVM_TEST_90000002)
    expect(resultCheckRemove2).toEqual([])

    const randomSender = await blockchain.treasury('randomSender')
    const result3 = await onramp.sendUpdateAllowlists(randomSender.getSender(), {
      value: toNano('0.5'),
      updateAllowlists,
    })
    expect(result3.transactions).toHaveTransaction({
      from: randomSender.address,
      to: onramp.address,
      success: false,
    })
  })

  it('getStaticConfig should return chain selector', async () => {
    const result = await onramp.getStaticConfig()
    expect(result).toBe(CHAINSEL_TON)
  })
})

const assertAddressesMatch = (expected: Address[], actual: Address[]) => {
  expect(actual.map((x) => x.toString()).sort()).toEqual(
    expected
      .map((x) => {
        return x.toString()
      })
      .sort(),
  )
}
