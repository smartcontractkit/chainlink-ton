import '@ton/test-utils'

import { toNano } from '@ton/core'

import { FeeQuoterSetup } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'

describe('FeeQuoter UpdateTokenTransferFeeConfigs', () => {
  let setup: FeeQuoterSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })

  beforeEach(async () => {
    setup = new FeeQuoterSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('updateTokenTransferFeeConfigs', blockchain)
  })

  const sampleTokenTransferFeeConfig: feeQuoter.TokenTransferFeeConfig = {
    isEnabled: true,
    minFeeUsdCents: 50,
    maxFeeUsdCents: 1000,
    deciBps: 10,
    destGasOverhead: 90000,
    destBytesOverhead: 32,
  }

  it('should add token transfer fee config', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map([[token, sampleTokenTransferFeeConfig]]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the config was added
    const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(destChainSelector, token)
    expect(config.isEnabled).toBe(sampleTokenTransferFeeConfig.isEnabled)
    expect(config.minFeeUsdCents).toBe(sampleTokenTransferFeeConfig.minFeeUsdCents)
    expect(config.maxFeeUsdCents).toBe(sampleTokenTransferFeeConfig.maxFeeUsdCents)
    expect(config.deciBps).toBe(sampleTokenTransferFeeConfig.deciBps)
    expect(config.destGasOverhead).toBe(sampleTokenTransferFeeConfig.destGasOverhead)
    expect(config.destBytesOverhead).toBe(sampleTokenTransferFeeConfig.destBytesOverhead)
  })

  it('should remove token transfer fee config', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    // First add the config
    await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        updates: new Map([
          [
            destChainSelector,
            {
              add: new Map([[token, sampleTokenTransferFeeConfig]]),
              remove: [],
            },
          ],
        ]),
      },
    })

    // Verify it exists
    const configBefore = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector,
      token,
    )
    expect(configBefore.isEnabled).toBe(true)

    // Now remove it
    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map(),
                remove: [token],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the config was removed - should throw error when trying to get it
    await expect(
      setup.bind.feeQuoter.getTokenTransferFeeConfig(destChainSelector, token),
    ).rejects.toThrow()
  })

  it('should add multiple token transfer fee configs at once', async () => {
    const token1 = FeeQuoterSetup.CUSTOM_TOKEN.token
    const token2 = FeeQuoterSetup.CUSTOM_TOKEN_2.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    const config2 = {
      ...sampleTokenTransferFeeConfig,
      minFeeUsdCents: 100,
      maxFeeUsdCents: 2000,
    }

    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map([
                  [token1, sampleTokenTransferFeeConfig],
                  [token2, config2],
                ]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify both configs were added
    const fetchedConfig1 = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector,
      token1,
    )
    expect(fetchedConfig1.minFeeUsdCents).toBe(sampleTokenTransferFeeConfig.minFeeUsdCents)

    const fetchedConfig2 = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector,
      token2,
    )
    expect(fetchedConfig2.minFeeUsdCents).toBe(config2.minFeeUsdCents)
  })

  it('should remove multiple token transfer fee configs at once', async () => {
    const token1 = FeeQuoterSetup.CUSTOM_TOKEN.token
    const token2 = FeeQuoterSetup.CUSTOM_TOKEN_2.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    // First add both configs
    await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        updates: new Map([
          [
            destChainSelector,
            {
              add: new Map([
                [token1, sampleTokenTransferFeeConfig],
                [token2, sampleTokenTransferFeeConfig],
              ]),
              remove: [],
            },
          ],
        ]),
      },
    })

    // Now remove both
    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map(),
                remove: [token1, token2],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify both configs were removed
    await expect(
      setup.bind.feeQuoter.getTokenTransferFeeConfig(destChainSelector, token1),
    ).rejects.toThrow()
    await expect(
      setup.bind.feeQuoter.getTokenTransferFeeConfig(destChainSelector, token2),
    ).rejects.toThrow()
  })

  it('should update configs for multiple destination chains at once', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const destChainSelector1 = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM
    const destChainSelector2 = FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM

    const config1 = sampleTokenTransferFeeConfig
    const config2 = {
      ...sampleTokenTransferFeeConfig,
      minFeeUsdCents: 100,
    }

    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector1,
              {
                add: new Map([[token, config1]]),
                remove: [],
              },
            ],
            [
              destChainSelector2,
              {
                add: new Map([[token, config2]]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify configs were added for both chains
    const fetchedConfig1 = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector1,
      token,
    )
    expect(fetchedConfig1.minFeeUsdCents).toBe(config1.minFeeUsdCents)

    const fetchedConfig2 = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector2,
      token,
    )
    expect(fetchedConfig2.minFeeUsdCents).toBe(config2.minFeeUsdCents)
  })

  it('should add and remove configs in same transaction', async () => {
    const tokenToAdd = FeeQuoterSetup.CUSTOM_TOKEN.token
    const tokenToRemove = FeeQuoterSetup.CUSTOM_TOKEN_2.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    // First add the token to be removed
    await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        updates: new Map([
          [
            destChainSelector,
            {
              add: new Map([[tokenToRemove, sampleTokenTransferFeeConfig]]),
              remove: [],
            },
          ],
        ]),
      },
    })

    // Now add one and remove the other in same transaction
    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map([[tokenToAdd, sampleTokenTransferFeeConfig]]),
                remove: [tokenToRemove],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify tokenToAdd exists
    const configAdded = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector,
      tokenToAdd,
    )
    expect(configAdded.isEnabled).toBe(true)

    // Verify tokenToRemove was removed
    await expect(
      setup.bind.feeQuoter.getTokenTransferFeeConfig(destChainSelector, tokenToRemove),
    ).rejects.toThrow()
  })

  it('should update existing token transfer fee config', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    // Add initial config
    await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        updates: new Map([
          [
            destChainSelector,
            {
              add: new Map([[token, sampleTokenTransferFeeConfig]]),
              remove: [],
            },
          ],
        ]),
      },
    })

    // Update with new config
    const updatedConfig: feeQuoter.TokenTransferFeeConfig = {
      ...sampleTokenTransferFeeConfig,
      minFeeUsdCents: 200,
      maxFeeUsdCents: 5000,
    }

    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map([[token, updatedConfig]]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the config was updated
    const fetchedConfig = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
      destChainSelector,
      token,
    )
    expect(fetchedConfig.minFeeUsdCents).toBe(updatedConfig.minFeeUsdCents)
    expect(fetchedConfig.maxFeeUsdCents).toBe(updatedConfig.maxFeeUsdCents)
  })

  it('should only allow owner to update token transfer fee configs', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const destChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM

    // Try with non-owner
    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              destChainSelector,
              {
                add: new Map([[token, sampleTokenTransferFeeConfig]]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })

  it('should handle updates for non-existent destination chain gracefully', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN.token
    const nonExistentChainSelector = 99999n

    // This should not fail, but the config won't be added because the dest chain doesn't exist
    const result = await setup.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              nonExistentChainSelector,
              {
                add: new Map([[token, sampleTokenTransferFeeConfig]]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )

    // The transaction should succeed but nothing should be updated
    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_update_token_transfer_fee_configs_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
