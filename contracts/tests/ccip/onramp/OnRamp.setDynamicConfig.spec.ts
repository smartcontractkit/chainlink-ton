import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { randomAddress } from '@ton/test-utils'

import * as coverage from '../../coverage/coverage'
import { ZERO_ADDRESS } from '../../../src/utils'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as or from '../../../wrappers/ccip/OnRamp'
import { deployOnRampContract } from './OnRamp.Setup'

describe('OnRamp - set Dynamic Config', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    owner = await blockchain.treasury('deployer')
    onramp = await deployOnRampContract(blockchain, owner)
  })

  it('should allow owner to set dynamic config', async () => {
    const newConfig = {
      feeQuoter: randomAddress(),
      feeAggregator: randomAddress(),
      allowlistAdmin: randomAddress(),
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
    expect(dynamicConfig.feeQuoter.equals(newConfig.feeQuoter)).toBe(true)
    expect(dynamicConfig.feeAggregator.equals(newConfig.feeAggregator)).toBe(true)
    expect(dynamicConfig.allowlistAdmin.equals(newConfig.allowlistAdmin)).toBe(true)
  })

  it('should fail on non-owner setting dynamic config', async () => {
    const nonOwner = await blockchain.treasury('nonOwner')
    const newConfig = {
      feeQuoter: randomAddress(),
      feeAggregator: randomAddress(),
      allowlistAdmin: randomAddress(),
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

  it('should not allow zero address for feeQuoter', async () => {
    const newConfig = {
      feeQuoter: ZERO_ADDRESS,
      feeAggregator: randomAddress(),
      allowlistAdmin: randomAddress(),
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
      success: false,
      exitCode: or.Errors.InvalidConfig,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      coverage.generateCoverageArtifacts(blockchain, 'onramp_unit_tests', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
