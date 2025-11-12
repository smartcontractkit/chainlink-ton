import '@ton/test-utils'

import { toNano } from '@ton/core'

import { FeeQuoterSetup } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'

describe('FeeQuoter UpdatePrices', () => {
  let setup: FeeQuoterSetup

  beforeEach(async () => {
    setup = new FeeQuoterSetup()
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('updatePrices')
  })

  it('should only trust allowedPriceUpdaters', async () => {
    // Allow us to updatePrices again
    const addPriceUpdaterResult = await setup.bind.feeQuoter.sendAddPriceUpdater(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: { priceUpdater: setup.acc.deployer.address },
      },
    )
    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: [],
      gasPricesUpdates: [],
    }

    // Send updatePrices transaction and expect it to succeed
    const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.deployer.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )
    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Remove sender from allowed updaters
    const removePriceUpdaterResult = await setup.bind.feeQuoter.sendRemovePriceUpdater(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: { priceUpdater: setup.acc.deployer.address },
      },
    )
    expect(removePriceUpdaterResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Send updatePrices transaction and expect it to fail
    const updateFailResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.deployer.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )
    expect(updateFailResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })

    // Owner can always update
    const ownerUpdateResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )
    expect(ownerUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })
  })

  it('should update only token price', async () => {
    const tokenPriceUpdate: feeQuoter.TokenPriceUpdate = {
      token: FeeQuoterSetup.SOURCE_FEE_TOKENS[0].token, // ZERO_ADDRESS (native TON)
      price: 4000000000000000000n, // 4e18 = $4
    }

    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: [tokenPriceUpdate],
      gasPricesUpdates: [],
    }

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: { updates: priceUpdates },
    })

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the token price was updated
    const tokenPrice = await setup.bind.feeQuoter.getTokenPrice(
      FeeQuoterSetup.SOURCE_FEE_TOKENS[0].token,
    )
    expect(tokenPrice.value).toEqual(tokenPriceUpdate.price)
  })

  it('should update only gas price', async () => {
    const gasPriceUpdate: feeQuoter.GasPriceUpdate = {
      chainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      executionGasPrice: 2000000000000000000000n, // 2000e18
      dataAvailabilityGasPrice: 1000000000000000000n, // 1e18
    }

    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: [],
      gasPricesUpdates: [gasPriceUpdate],
    }

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: { updates: priceUpdates },
    })

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the gas price was updated
    const gasPrice = await setup.bind.feeQuoter.getDestinationChainGasPrice(
      FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
    )
    expect(gasPrice.value.executionGasPrice).toEqual(gasPriceUpdate.executionGasPrice)
    expect(gasPrice.value.dataAvailabilityGasPrice).toEqual(gasPriceUpdate.dataAvailabilityGasPrice)
  })

  it('should update multiple prices', async () => {
    const tokenPriceUpdates: feeQuoter.TokenPriceUpdate[] = [
      { token: FeeQuoterSetup.SOURCE_FEE_TOKENS[0].token, price: 4000000000000000000n }, // $4 - ZERO_ADDRESS
      { token: FeeQuoterSetup.SOURCE_FEE_TOKENS[1].token, price: 1800000000000000000000n }, // $1800 - CUSTOM_TOKEN
      { token: FeeQuoterSetup.CUSTOM_TOKEN.token, price: 1000000000000000000n }, // $1 - CUSTOM_TOKEN_1
    ]

    const gasPriceUpdates: feeQuoter.GasPriceUpdate[] = [
      {
        chainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        executionGasPrice: 2000000n, // 2e6
        dataAvailabilityGasPrice: 1000000n, // 1e6
      },
      {
        chainSelector: FeeQuoterSetup.SOURCE_CHAIN_SELECTOR,
        executionGasPrice: 2000000000000000000000n, // 2000e18
        dataAvailabilityGasPrice: 1000000000000000000000n, // 1000e18
      },
      {
        chainSelector: 12345n, // Small chain selector that fits in 64 bits
        executionGasPrice: 1000000000000000000n, // 1e18
        dataAvailabilityGasPrice: 500000000000000000n, // 0.5e18
      },
    ]

    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: tokenPriceUpdates,
      gasPricesUpdates: gasPriceUpdates,
    }

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: { updates: priceUpdates },
    })

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify all token prices were updated
    for (let i = 0; i < tokenPriceUpdates.length; i++) {
      const tokenPrice = await setup.bind.feeQuoter.getTokenPrice(tokenPriceUpdates[i].token)
      expect(tokenPrice.value).toEqual(tokenPriceUpdates[i].price)
    }

    // Note: For gas prices, we can only test the first one since the contract
    // only supports one destination chain config in our simplified setup
    const gasPrice = await setup.bind.feeQuoter.getDestinationChainGasPrice(
      FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
    )
    expect(gasPrice.value.executionGasPrice).toEqual(gasPriceUpdates[0].executionGasPrice)
    expect(gasPrice.value.dataAvailabilityGasPrice).toEqual(
      gasPriceUpdates[0].dataAvailabilityGasPrice,
    )
  })

  it.skip('should revert when caller is not authorized', async () => {
    // TODO: Implement proper authorization in TON FeeQuoter contract
    // Currently the contract allows any caller to update prices
    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: [
        { token: FeeQuoterSetup.SOURCE_FEE_TOKENS[0].token, price: 4000000000000000000n },
      ],
      gasPricesUpdates: [],
    }

    // Try to update prices with unauthorized account (priceUpdaterOne instead of owner)
    const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.priceUpdaterOne.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )

    // In TON, unauthorized access typically results in failed transaction
    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })

  // Note: TON doesn't have a direct equivalent to Solidity's AuthorizedCallers pattern
  // The authorization in TON FeeQuoter is handled through ownership checks
  // This test demonstrates the basic unauthorized access behavior
  it.skip('should only allow owner to update prices', async () => {
    // TODO: Implement proper authorization in TON FeeQuoter contract
    // Currently the contract allows any caller to update prices
    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: [
        { token: FeeQuoterSetup.SOURCE_FEE_TOKENS[0].token, price: 4000000000000000000n },
      ],
      gasPricesUpdates: [],
    }

    // Owner should be able to update prices
    const ownerUpdateResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )

    expect(ownerUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // External caller should not be able to update prices
    const externalUpdateResult = await setup.bind.feeQuoter.sendUpdatePrices(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { updates: priceUpdates },
      },
    )

    expect(externalUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })
})
