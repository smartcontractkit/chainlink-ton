import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

import { FeeQuoterSetup } from './FeeQuoterSetup'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'
import { generateRandomTonAddress } from '../../../src/utils'

describe('FeeQuoter Getters', () => {
  let setup: FeeQuoterSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })

  beforeEach(async () => {
    setup = new FeeQuoterSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('getters', blockchain)
  })

  describe('feeTokens', () => {
    it('should return list of fee tokens', async () => {
      const feeTokens = await setup.bind.feeQuoter.getFeeTokens()

      expect(feeTokens).toBeDefined()
      expect(feeTokens!.length).toBeGreaterThan(0)

      // Check that SOURCE_FEE_TOKEN and NATIVE_TON are in the list
      const feeTokenAddresses = feeTokens!.map((item: any) => item.toString())
      expect(feeTokenAddresses).toContain(FeeQuoterSetup.SOURCE_FEE_TOKEN.token.toString())
      expect(feeTokenAddresses).toContain(FeeQuoterSetup.NATIVE_TON.token.toString())
    })

    it('should return empty list when no fee tokens configured', async () => {
      // Remove all fee tokens
      const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
        value: toNano('1'),
        msg: {
          add: new Map(),
          remove: [FeeQuoterSetup.SOURCE_FEE_TOKEN.token, FeeQuoterSetup.NATIVE_TON.token],
        },
      })

      expect(result.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })

      const feeTokens = await setup.bind.feeQuoter.getFeeTokens()
      expect(feeTokens).toEqual([])
    })
  })

  describe('destChainSelectors', () => {
    it('should return list of destination chain selectors', async () => {
      const destChainSelectors = await setup.bind.feeQuoter.getDestChainSelectors()

      expect(destChainSelectors).toBeDefined()
      expect(destChainSelectors!.length).toBeGreaterThan(0)

      // Check that our configured chains are in the list
      const selectors = destChainSelectors!.map((item: any) => BigInt(item.toString()))
      expect(selectors).toContain(FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM)
      expect(selectors).toContain(FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM)
      expect(selectors).toContain(FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI)
    })
  })

  describe('tokenPrices', () => {
    it('should return prices for multiple configured tokens', async () => {
      const tokens = [FeeQuoterSetup.SOURCE_FEE_TOKEN.token, FeeQuoterSetup.CUSTOM_TOKEN.token]

      const prices = await setup.bind.feeQuoter.getTokenPrices(tokens)

      expect(prices).toBeDefined()
      expect(prices.length).toBe(tokens.length)

      // Each price should be a valid TimestampedPrice
      for (let i = 0; i < prices.length; i++) {
        expect(prices[i].value).toBeGreaterThan(0n)
        expect(prices[i].timestamp).toBeGreaterThan(0n)
      }
    })

    it('should return prices in correct order', async () => {
      const tokens = [
        FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
        FeeQuoterSetup.CUSTOM_TOKEN.token,
        FeeQuoterSetup.CUSTOM_TOKEN_2.token,
      ]

      const prices = await setup.bind.feeQuoter.getTokenPrices(tokens)

      expect(prices.length).toBe(tokens.length)
      expect(prices[0].value).toBe(FeeQuoterSetup.SOURCE_FEE_TOKEN.price)
      expect(prices[1].value).toBe(FeeQuoterSetup.CUSTOM_TOKEN.price)
      expect(prices[2].value).toBe(FeeQuoterSetup.CUSTOM_TOKEN_2.price)
    })
  })

  describe('pendingOwner', () => {
    it('should return null when no pending owner', async () => {
      const pendingOwner = await setup.bind.feeQuoter.getPendingOwner()
      expect(pendingOwner).toBeNull()
    })

    it('should return pending owner address when ownership transfer initiated', async () => {
      const newOwner = setup.acc.externalCaller.address

      // Transfer ownership
      const result = await setup.bind.feeQuoter.sendTransferOwnership(
        setup.acc.owner.getSender(),
        toNano('1'),
        { newOwner, queryId: 0n },
      )

      expect(result.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })

      const pendingOwner = await setup.bind.feeQuoter.getPendingOwner()
      expect(pendingOwner?.toString()).toBe(newOwner.toString())
    })
  })

  describe('validatedFeeCell', () => {
    it('should calculate fee from cell-encoded message', async () => {
      const message = setup.generateEmptyMessage({
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
      })

      const fee = await setup.bind.feeQuoter.getValidatedFeeCell(message)

      expect(fee).toBeGreaterThan(0n)

      // Verify it matches the non-cell version
      const feeFromMessage = await setup.bind.feeQuoter.getValidatedFee(message)
      expect(fee).toBe(feeFromMessage)
    })
  })

  describe('staticConfig', () => {
    it('should return static configuration', async () => {
      const config = await setup.bind.feeQuoter.getStaticConfig()

      expect(config.maxFeeJuelsPerMsg).toBe(FeeQuoterSetup.MAX_MSG_FEES_JUELS)
      expect(config.linkToken.toString()).toBe(FeeQuoterSetup.SOURCE_LINK.token.toString())
      expect(config.tokenPriceStalenessThreshold).toBe(BigInt(FeeQuoterSetup.TWELVE_HOURS))
    })
  })

  describe('facilityId', () => {
    it('should return correct facility ID', async () => {
      const facilityId = await setup.bind.feeQuoter.getFacilityId()

      // The facility ID is derived from the contract name hash
      expect(facilityId).toBeGreaterThan(0)
    })
  })

  describe('errorCode', () => {
    it('should convert local error code to global error code', async () => {
      const localErrorCode = 1

      const globalErrorCode = await setup.bind.feeQuoter.getErrorCode(localErrorCode)

      expect(globalErrorCode).toBeGreaterThan(localErrorCode)
      // Global error code should be facilityId * 100 + localErrorCode
      const facilityId = await setup.bind.feeQuoter.getFacilityId()
      expect(globalErrorCode).toBe(facilityId * 100 + localErrorCode)
    })

    it('should handle zero error code', async () => {
      const localErrorCode = 0

      const globalErrorCode = await setup.bind.feeQuoter.getErrorCode(localErrorCode)

      const facilityId = await setup.bind.feeQuoter.getFacilityId()
      expect(globalErrorCode).toBe(facilityId * 100)
    })
  })

  describe('tokenTransferFeeConfig', () => {
    it('should throw error for non-existent token config', async () => {
      const nonExistentToken = await generateRandomTonAddress()

      await expect(
        setup.bind.feeQuoter.getTokenTransferFeeConfig(
          FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          nonExistentToken,
        ),
      ).rejects.toThrow()
    })

    it('should throw error for non-existent destination chain', async () => {
      const nonExistentChain = 99999n

      await expect(
        setup.bind.feeQuoter.getTokenTransferFeeConfig(
          nonExistentChain,
          FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
        ),
      ).rejects.toThrow()
    })
  })

  describe('tokenAndGasPrices', () => {
    it('should return combined token and gas prices', async () => {
      // Note: This getter appears to be a stub in the contract (empty implementation)
      // Testing that it can be called without error
      const result = await setup.bind.feeQuoter.getTokenAndGasPrices(
        FeeQuoterSetup.NATIVE_TON.token,
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      )

      // Just verify it doesn't throw
      expect(result).toBeDefined()
    })
  })

  describe('reserve', () => {
    it('should return reserve amount', async () => {
      const reserve = await setup.bind.feeQuoter.getReserve()

      expect(reserve).toBeGreaterThan(0n)
    })
  })

  describe('tokenPrice', () => {
    it('should return price for existing token', async () => {
      const price = await setup.bind.feeQuoter.getTokenPrice(FeeQuoterSetup.NATIVE_TON.token)

      expect(price.value).toBe(FeeQuoterSetup.NATIVE_TON.price)
      expect(price.timestamp).toBeGreaterThan(0n)
    })

    it('should throw error for non-existent token', async () => {
      const randomToken = Address.parse(
        `0:${Buffer.from('NONEXISTENT').toString('hex').padStart(64, '0')}`,
      )

      await expect(setup.bind.feeQuoter.getTokenPrice(randomToken)).rejects.toThrow()
    })
  })

  describe('destinationChainGasPrice', () => {
    it('should return gas price for existing chain', async () => {
      const gasPrice = await setup.bind.feeQuoter.getDestinationChainGasPrice(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      )

      expect(gasPrice.value).toBeDefined()
      expect(gasPrice.value.executionGasPrice).toBeDefined()
      expect(gasPrice.value.dataAvailabilityGasPrice).toBeDefined()
      expect(gasPrice.value.timestamp).toBeDefined()
    })

    it('should throw error for non-existent chain', async () => {
      const nonExistentChain = 99999n

      await expect(
        setup.bind.feeQuoter.getDestinationChainGasPrice(nonExistentChain),
      ).rejects.toThrow()
    })
  })

  describe('premiumMultiplierWeiPerEth', () => {
    it('should return premium multiplier for fee token', async () => {
      const multiplier = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        FeeQuoterSetup.NATIVE_TON.token,
      )

      expect(multiplier).toBeGreaterThan(0n)
    })

    it('should throw error for non-fee token', async () => {
      const randomToken = Address.parse(
        `0:${Buffer.from('NOTAFEETOKEN').toString('hex').padStart(64, '0')}`,
      )

      await expect(
        setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(randomToken),
      ).rejects.toThrow()
    })
  })

  describe('destChainConfig', () => {
    it('should return config for existing chain', async () => {
      const config = await setup.bind.feeQuoter.getDestChainConfig(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      )

      expect(config.isEnabled).toBe(true)
      expect(config.maxNumberOfTokensPerMsg).toBe(FeeQuoterSetup.MAX_TOKENS_LENGTH)
      expect(config.maxDataBytes).toBe(FeeQuoterSetup.MAX_DATA_SIZE)
      expect(config.maxPerMsgGasLimit).toBe(FeeQuoterSetup.MAX_GAS_LIMIT)
    })

    it('should throw error for non-existent chain', async () => {
      const nonExistentChain = 99999n

      await expect(setup.bind.feeQuoter.getDestChainConfig(nonExistentChain)).rejects.toThrow()
    })
  })

  describe('dataAvailabilityCost', () => {
    it('should calculate data availability cost', async () => {
      const cost = await setup.bind.feeQuoter.getDataAvailabilityCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        1000n,
        0n,
        0n,
      )

      expect(cost).toBeGreaterThan(0n)
    })

    it('should throw error for non-existent chain', async () => {
      const nonExistentChain = 99999n

      await expect(
        setup.bind.feeQuoter.getDataAvailabilityCost(
          nonExistentChain,
          FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
          1000n,
          0n,
          0n,
        ),
      ).rejects.toThrow()
    })

    it('should throw error when token transfers provided (not supported)', async () => {
      await expect(
        setup.bind.feeQuoter.getDataAvailabilityCost(
          FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
          1000n,
          1n, // tokenCount > 0
          32n,
        ),
      ).rejects.toThrow()
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_getters_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
