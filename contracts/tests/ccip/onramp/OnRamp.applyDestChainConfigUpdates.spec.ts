import * as or from '../../../wrappers/ccip/OnRamp'
import * as coverage from '../../coverage/coverage'

import { toNano } from '@ton/core'
import { generateRandomTonAddress, ZERO_ADDRESS } from '../../../src/utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  assertAddressesMatch,
  CHAINSEL_EVM_TEST,
  CHAINSEL_EVM_TEST_90000002,
  deployOnRampContract,
  setup,
} from './OnRamp.Setup'

describe('OnRamp - Apply Dest Chain Config Updates', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeEach(async () => {
    ;({ blockchain, deployer, onramp } = await setup())
  })

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

    const updateAllowlists: or.UpdateAllowlists = {
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

    const updateAllowlists2: or.UpdateAllowlists = {
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

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'onramp_apply_dest_chain_config_updates',
        [
          {
            code: await or.OnRamp.code(),
            name: 'onramp',
          },
        ],
      )
    }
  })
})
