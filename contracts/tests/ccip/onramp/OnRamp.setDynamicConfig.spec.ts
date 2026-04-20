import { toNano } from '@ton/core'
import { randomAddress } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import { deployOnRampContract } from './OnRamp.Setup'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

describe('OnRamp - set Dynamic Config', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let config: or.DynamicConfig

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    owner = await blockchain.treasury('deployer')
    ;({ onramp, config } = await deployOnRampContract(blockchain, owner))
  })

  it('should allow owner to set dynamic config', async () => {
    const newConfig = {
      feeQuoter: randomAddress(),
      feeAggregator: randomAddress(),
      allowlistAdmin: randomAddress(),
      reserve: toNano('42'),
    }
    const resultUpdateDestChainConfigs = await onramp.sendSetDynamicConfig(owner.getSender(), {
      value: toNano('0.5'),
      body: {
        config: newConfig,
      },
    })
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: owner.address,
      to: onramp.address,
      success: true,
    })

    const dynamicConfig = await onramp.getDynamicConfig()
    expect(dynamicConfig.feeQuoter).toEqual(newConfig.feeQuoter)
    expect(dynamicConfig.feeAggregator).toEqual(newConfig.feeAggregator)
    expect(dynamicConfig.allowlistAdmin).toEqual(newConfig.allowlistAdmin)
    expect(dynamicConfig.reserve).toBe(newConfig.reserve)
  })

  it('should fail on non-owner setting dynamic config', async () => {
    const nonOwner = await blockchain.treasury('nonOwner')
    const newConfig = {
      feeQuoter: randomAddress(),
      feeAggregator: randomAddress(),
      allowlistAdmin: randomAddress(),
      reserve: toNano('42'),
    }
    const resultUpdateDestChainConfigs = await onramp.sendSetDynamicConfig(nonOwner.getSender(), {
      value: toNano('0.5'),
      body: {
        config: newConfig,
      },
    })
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: nonOwner.address,
      to: onramp.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_set-dynamic_config_tests', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
