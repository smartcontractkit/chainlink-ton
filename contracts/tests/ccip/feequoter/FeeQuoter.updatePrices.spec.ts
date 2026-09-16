import '@ton/test-utils'

import { Address, Sender, toNano } from '@ton/core'

import { FeeQuoterSetup } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/gen/ccip/FeeQuoter'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'
import { ChainSelectors } from '../../utils/Selectors'

describe('FeeQuoter UpdatePrices', () => {
  let setup: FeeQuoterSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })
  beforeEach(async () => {
    setup = new FeeQuoterSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('updatePrices', blockchain)
  })

  it('should only trust allowedPriceUpdaters', async () => {
    // Allow us to updatePrices again
    const addPriceUpdaterResult = await setup.bind.feeQuoter.sendFeeQuoterAddPriceUpdater(
      setup.acc.owner.getSender(),
      toNano('1'),
      { priceUpdater: setup.acc.deployer.address },
    )
    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [],
    })

    // Send updatePrices transaction and expect it to succeed
    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.deployer.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )
    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Remove sender from allowed updaters
    const removePriceUpdaterResult = await setup.bind.feeQuoter.sendFeeQuoterRemovePriceUpdater(
      setup.acc.owner.getSender(),
      toNano('1'),
      { priceUpdater: setup.acc.deployer.address },
    )
    expect(removePriceUpdaterResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Send updatePrices transaction and expect it to fail
    const updateFailResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.deployer.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )
    expect(updateFailResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })

    // Owner can always update
    const ownerUpdateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )
    expect(ownerUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })
  })

  it('should return excess to specified address', async () => {
    // Allow us to updatePrices again
    const addPriceUpdaterResult = await setup.bind.feeQuoter.sendFeeQuoterAddPriceUpdater(
      setup.acc.owner.getSender(),
      toNano('1'),
      { priceUpdater: setup.acc.deployer.address },
    )
    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [],
    })

    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.deployer.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.externalCaller.address,
      }),
    )
    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(updateResult.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      to: setup.acc.externalCaller.address,
      success: true,
    })

    const updateResult2 = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.deployer.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({ updates: priceUpdates }),
    )
    expect(updateResult2.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(updateResult2.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      to: setup.acc.deployer.address,
      success: true,
    })
  })

  it('should update only token price', async () => {
    const tokenPriceUpdate = feeQuoter.TokenPriceUpdate.create({
      sourceToken: FeeQuoterSetup.NATIVE_TON.token,
      usdPerToken: 4000000000000000000n, // 4e18 = $4
    })

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [tokenPriceUpdate],
      gasPriceUpdates: [],
    })

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the token price was updated
    const tokenPrice = await setup.bind.feeQuoter.getTokenPrice(FeeQuoterSetup.NATIVE_TON.token)
    expect(tokenPrice.value).toEqual(tokenPriceUpdate.usdPerToken)
  })

  it('should update only gas price', async () => {
    const gasPriceUpdate = feeQuoter.GasPriceUpdate.create({
      destChainSelector: ChainSelectors.testnet.evm,
      executionGasPrice: 2000000000000000000000n, // 2000e18
      dataAvailabilityGasPrice: 1000000000000000000n, // 1e18
    })

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [gasPriceUpdate],
    })

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the gas price was updated
    const gasPrice = await setup.bind.feeQuoter.getDestinationChainGasPrice(
      ChainSelectors.testnet.evm,
    )
    expect(gasPrice.executionGasPrice).toEqual(gasPriceUpdate.executionGasPrice)
    expect(gasPrice.dataAvailabilityGasPrice).toEqual(gasPriceUpdate.dataAvailabilityGasPrice)
  })

  it('should update multiple prices', async () => {
    const tokenPriceUpdates: feeQuoter.TokenPriceUpdate[] = [
      { sourceToken: FeeQuoterSetup.NATIVE_TON.token, usdPerToken: 4000000000000000000n }, // $4 - NATIVE_TON
      { sourceToken: FeeQuoterSetup.CUSTOM_TOKEN.token, usdPerToken: 1800000000000000000000n }, // $1800 - CUSTOM_TOKEN
      { sourceToken: FeeQuoterSetup.CUSTOM_TOKEN_2.token, usdPerToken: 1000000000000000000n }, // $1 - CUSTOM_TOKEN_2
    ].map((update) => feeQuoter.TokenPriceUpdate.create(update))

    const gasPriceUpdates: feeQuoter.GasPriceUpdate[] = [
      {
        destChainSelector: ChainSelectors.testnet.evm,
        executionGasPrice: 2000000n, // 2e6
        dataAvailabilityGasPrice: 1000000n, // 1e6
      },
      {
        destChainSelector: ChainSelectors.testnet.ton,
        executionGasPrice: 2000000000000000000000n, // 2000e18
        dataAvailabilityGasPrice: 1000000000000000000000n, // 1000e18
      },
      {
        destChainSelector: 12345n, // Small chain selector that fits in 64 bits
        executionGasPrice: 1000000000000000000n, // 1e18
        dataAvailabilityGasPrice: 500000000000000000n, // 0.5e18
      },
    ].map((update) => feeQuoter.GasPriceUpdate.create(update))

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: tokenPriceUpdates,
      gasPriceUpdates: gasPriceUpdates,
    })

    // Send updatePrices transaction
    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify all token prices were updated
    for (let i = 0; i < tokenPriceUpdates.length; i++) {
      const tokenPrice = await setup.bind.feeQuoter.getTokenPrice(tokenPriceUpdates[i].sourceToken)
      expect(tokenPrice.value).toEqual(tokenPriceUpdates[i].usdPerToken)
    }

    // Note: For gas prices, we can only test the first one since the contract
    // only supports one destination chain config in our simplified setup
    const gasPrice = await setup.bind.feeQuoter.getDestinationChainGasPrice(
      ChainSelectors.testnet.evm,
    )
    expect(gasPrice.executionGasPrice).toEqual(gasPriceUpdates[0].executionGasPrice)
    expect(gasPrice.dataAvailabilityGasPrice).toEqual(gasPriceUpdates[0].dataAvailabilityGasPrice)
  })

  it('should revert when caller is not authorized', async () => {
    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [
        feeQuoter.TokenPriceUpdate.create({
          sourceToken: FeeQuoterSetup.NATIVE_TON.token,
          usdPerToken: 4000000000000000000n,
        }),
      ],
      gasPriceUpdates: [],
    })

    // Try to update prices with unauthorized account (priceUpdaterOne instead of owner)
    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.priceUpdaterOne.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    // In TON, unauthorized access typically results in failed transaction
    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })

  it('should only allow owner to update prices', async () => {
    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [
        feeQuoter.TokenPriceUpdate.create({
          sourceToken: FeeQuoterSetup.NATIVE_TON.token,
          usdPerToken: 4000000000000000000n,
        }),
      ],
      gasPriceUpdates: [],
    })

    // Owner should be able to update prices
    const ownerUpdateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(ownerUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // External caller should not be able to update prices
    const externalUpdateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(externalUpdateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })

  it('should not end up with lower balance than initial balance after returning excess', async () => {
    const contract = await blockchain.getContract(setup.bind.feeQuoter.address)
    const initialBalance = contract.balance

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: [
        feeQuoter.TokenPriceUpdate.create({
          sourceToken: FeeQuoterSetup.NATIVE_TON.token,
          usdPerToken: 4000000000000000000n,
        }),
      ],
      gasPriceUpdates: [],
    })

    const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('0.03'),
      feeQuoter.FeeQuoter_UpdatePrices.create({
        updates: priceUpdates,
        sendExcessesTo: setup.acc.deployer.address,
      }),
    )

    expect(updateResult.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    expect(updateResult.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      to: setup.acc.deployer.address,
      success: true,
    })

    const tx = updateResult.transactions.find(
      (tx) =>
        tx.inMessage &&
        tx.inMessage.info.src &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(setup.acc.owner.address) &&
        tx.inMessage.info.dest &&
        tx.inMessage.info.dest instanceof Address &&
        tx.inMessage.info.dest.equals(setup.bind.feeQuoter.address),
    )
    if (!tx || tx.description.type != 'generic') {
      throw new Error('Expected an internal message')
    }
    const storageFees = tx.description.storagePhase?.storageFeesCollected || toNano('0')

    const finalBalance = (await blockchain.getContract(setup.bind.feeQuoter.address)).balance
    expect(finalBalance).toEqual(initialBalance - storageFees)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_update_prices_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
