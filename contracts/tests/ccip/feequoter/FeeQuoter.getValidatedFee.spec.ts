import '@ton/test-utils'

import { toNano, beginCell, Cell } from '@ton/core'

import { FeeQuoterSetup, FeeQuoterFeeSetup, Token } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'
import { ExtraArgs } from '../../../wrappers/ccip/Router'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as rt from '../../../wrappers/ccip/Router'
import { asSnakeBytes } from '../../../src/utils'
import { skip } from 'node:test'
import { verifyBodyMessage } from '../../utils/verifyMessageBody'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'

describe('FeeQuoter GetValidatedFee', () => {
  let setup: FeeQuoterFeeSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })

  beforeEach(async () => {
    setup = new FeeQuoterFeeSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('getValidatedFee', blockchain)
  })

  it('should calculate fee for empty message', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS // Native TON and Link
    for (const token of testTokens) {
      var message = setup.generateEmptyMessage({
        feeToken: token.token,
      })

      // Get the validated fee using the helper method
      const messageValidated = await setup.getValidatedFee(message)

      const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        message.feeToken,
      )

      const gasUsed = BigInt(FeeQuoterSetup.GAS_LIMIT) + BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD)
      const gasFeeUSD =
        gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS
      const messageFeeUSD =
        FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
        premiumMultiplierWeiPerEth
      const calldataLen = BigInt(message.data.beginParse().remainingBits / 8)
      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        calldataLen,
        BigInt(message.tokenAmounts.length),
        0n,
      )

      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price
      expect(messageValidated.fee.feeTokenAmount).toEqual(totalPriceInFeeToken)
    }
  })

  it('should handle zero data availability multiplier', async () => {
    const destChainConfig = await setup.bind.feeQuoter.getDestChainConfig(
      FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
    )
    // Update dest chain config to set data availability multiplier to 0
    {
      const result = await setup.bind.feeQuoter.sendUpdateDestChainConfigs(
        setup.acc.owner.getSender(),
        {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
              config: {
                ...destChainConfig,
                destDataAvailabilityMultiplierBps: 0,
              },
            },
          ],
        },
      )
      expect(result.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })
    }
    const message = setup.generateEmptyMessage({
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
    })
    const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
      message.feeToken,
    )

    const feeResult = await setup.getValidatedFee(message)

    const gasUsed = BigInt(FeeQuoterSetup.GAS_LIMIT) + BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD)
    const gasFeeUSD =
      gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS
    const messageFeeUSD =
      FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
      premiumMultiplierWeiPerEth

    const totalPriceInFeeToken = (gasFeeUSD + messageFeeUSD) / FeeQuoterSetup.NATIVE_TON.price

    expect(feeResult.fee.feeTokenAmount).toEqual(totalPriceInFeeToken)
  })

  it('should handle high gas limit message', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS
    const customGasLimit = BigInt(FeeQuoterSetup.MAX_GAS_LIMIT)
    const customDataSize = FeeQuoterSetup.MAX_DATA_SIZE
    expect(customDataSize).toBeGreaterThan(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD)

    for (const token of testTokens) {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: asSnakeBytes(Buffer.alloc(customDataSize)),
        tokenAmounts: [],
        feeToken: token.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: customGasLimit,
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }

      const result = await setup.getValidatedFee(message)

      // Verify fee calculation with high gas and large data
      const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        message.feeToken,
      )

      const calldataLen = BigInt(customDataSize)

      // Calculate calldata cost with threshold
      const callDataCostHigh =
        (calldataLen - BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD)) *
          BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_HIGH) +
        BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD) *
          BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE)

      const gasUsed = customGasLimit + BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD) + callDataCostHigh

      const gasFeeUSD =
        gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS

      const messageFeeUSD =
        FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
        premiumMultiplierWeiPerEth

      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        calldataLen,
        BigInt(message.tokenAmounts.length),
        0n,
      )

      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price

      expect(result.fee.feeTokenAmount).toEqual(totalPriceInFeeToken)
    }
  })

  it('should allow out of order execution when not enforced', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: true,
        })
        .endCell(),
    }

    const result = await setup.getValidatedFee(message)
    expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
  })

  // Error cases

  it('should allow fail when allow out of order execution is false', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    await setup.assertGetFeeValidationError(
      message,
      feeQuoter.errors.ExtraArgOutOfOrderExecutionMustBeTrue,
    )
  })

  it('should revert when destination chain not enabled', async () => {
    const invalidChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM + 1n
    const message: rt.CCIPSend = {
      destChainSelector: invalidChainSelector,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    const result = await setup.bind.feeQuoter.sendGetValidatedFee(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: sx.opcodes.in.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          sx.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.DestChainNotEnabled)
              // return true
            },
          ],
        )
      },
    })
  })

  it('should revert when message too large', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: asSnakeBytes(Buffer.alloc(FeeQuoterSetup.MAX_DATA_SIZE + 1)),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    const result = await setup.bind.feeQuoter.sendGetValidatedFee(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: sx.opcodes.in.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          sx.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.MsgDataTooLarge)
            },
          ],
        )
      },
    })
  })

  it('should revert when too many tokens', async () => {
    const tooManyTokens = [FeeQuoterSetup.SOURCE_FEE_TOKEN] // We don't support token transfers in TON yet

    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: tooManyTokens.map((token) => ({
        token: token.token,
        amount: toNano('100'),
      })),
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    const result = await setup.bind.feeQuoter.sendGetValidatedFee(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: sx.opcodes.in.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          sx.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.UnsupportedNumberOfTokens)
            },
          ],
        )
      },
    })
  })

  it('should revert when gas limit too high', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.MAX_GAS_LIMIT + 1),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    const result = await setup.bind.feeQuoter.sendGetValidatedFee(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: sx.opcodes.in.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          sx.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.GasLimitTooHigh)
            },
          ],
        )
      },
    })
  })

  skip('should revert when fee token not supported', async () => {
    const notAFeeToken = FeeQuoterSetup.CUSTOM_TOKEN.token

    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: notAFeeToken,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: false,
        })
        .endCell(),
    }

    const result = await setup.bind.feeQuoter.sendGetValidatedFee(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: sx.opcodes.in.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          sx.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.FeeTokenNotSupported)
            },
          ],
        )
      },
    })
  })

  // Overflow/Underflow Edge Case Tests
  describe('Overflow and Underflow Edge Cases', () => {
    interface FeeQuoterOverrides extends Partial<feeQuoter.DestChainConfig> {
      // Gas prices - constrained by serialization limits
      executionGasPrice?: bigint // max: uint112 = 2^112-1 ≈ 5.2e33
      dataAvailabilityGasPrice?: bigint // max: uint112 = 2^112-1 ≈ 5.2e33
      // Token price and premium multiplier
      feeTokenPrice?: bigint // max: uint224 = 2^224-1 ≈ 2.7e67
      linkTokenPrice?: bigint // max: uint224 = 2^224-1 ≈ 2.7e67
      premiumMultiplier?: bigint // max: uint256 = 2^256-1 ≈ 1.2e77
      // Message parameters
      gasLimit?: bigint // constrained by maxPerMsgGasLimit (uint32)
      dataSize?: number // constrained by maxDataBytes (uint32)
    }

    async function feequoterOverwrite(overrides: FeeQuoterOverrides) {
      // Set up token prices
      const tokenPricesUpdates: Token[] = [
        ...(overrides.feeTokenPrice === undefined
          ? []
          : [
              {
                token: FeeQuoterSetup.NATIVE_TON.token,
                price: overrides.feeTokenPrice,
              },
            ]),
        ...(overrides.linkTokenPrice === undefined
          ? []
          : [
              {
                token: FeeQuoterSetup.SOURCE_LINK.token,
                price: overrides.linkTokenPrice,
              },
            ]),
      ]

      // Set up gas prices if specified
      const priceUpdates: feeQuoter.PriceUpdates = {
        tokenPricesUpdates: tokenPricesUpdates,
        gasPricesUpdates:
          overrides.executionGasPrice !== undefined ||
          overrides.dataAvailabilityGasPrice !== undefined
            ? [
                {
                  chainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
                  executionGasPrice: overrides.executionGasPrice ?? FeeQuoterSetup.USD_PER_GAS,
                  dataAvailabilityGasPrice:
                    overrides.dataAvailabilityGasPrice ??
                    FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
                },
              ]
            : [],
      }

      // Update prices if needed
      if (priceUpdates.gasPricesUpdates.length > 0 || priceUpdates.tokenPricesUpdates.length > 0) {
        const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(
          setup.acc.owner.getSender(),
          {
            value: toNano('1'),
            msg: { updates: priceUpdates, sendExcessesTo: setup.acc.deployer.address },
          },
        )
        expect(updateResult.transactions).toHaveTransaction({
          to: setup.bind.feeQuoter.address,
          success: true,
        })
      }

      // Get dest chain config keys for filtering
      const destChainConfigKeys = Object.keys(FeeQuoterSetup.destChainConfig) as Array<
        keyof feeQuoter.DestChainConfig
      >

      // Update dest chain config if needed
      const hasDestConfigOverrides = Object.keys(overrides).some((key) =>
        destChainConfigKeys.includes(key as keyof feeQuoter.DestChainConfig),
      )

      if (overrides.maxDataBytes) {
        expect(overrides.dataSize).toBeLessThanOrEqual(
          overrides.maxDataBytes ?? FeeQuoterSetup.destChainConfig.maxDataBytes,
        )
      }

      if (hasDestConfigOverrides) {
        // Extract only DestChainConfig properties from overrides
        const destConfigOverrides = Object.fromEntries(
          Object.entries(overrides).filter(
            ([key, value]) =>
              destChainConfigKeys.includes(key as keyof feeQuoter.DestChainConfig) &&
              value !== undefined,
          ),
        ) as Partial<feeQuoter.DestChainConfig>

        const destChainConfigResult = await setup.bind.feeQuoter.sendUpdateDestChainConfigs(
          setup.acc.owner.getSender(),
          {
            value: toNano('1'),
            updates: [
              {
                destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
                config: {
                  ...FeeQuoterSetup.destChainConfig,
                  ...destConfigOverrides,
                },
              },
            ],
          },
        )
        expect(destChainConfigResult.transactions).toHaveTransaction({
          to: setup.bind.feeQuoter.address,
          success: true,
        })
      }

      // Update fee token premium multiplier if specified
      if (overrides.premiumMultiplier !== undefined) {
        const feeTokenResult = await setup.bind.feeQuoter.sendUpdateFeeTokens(
          setup.acc.owner.getSender(),
          {
            value: toNano('1'),
            msg: {
              add: new Map([
                [
                  FeeQuoterSetup.NATIVE_TON.token,
                  { premiumMultiplierWeiPerEth: overrides.premiumMultiplier },
                ],
              ]),
              remove: [],
            },
          },
        )
        expect(feeTokenResult.transactions).toHaveTransaction({
          to: setup.bind.feeQuoter.address,
          success: true,
        })
      }
    }

    /**
     * Helper function to test overflow scenarios with configurable parameters
     * @param testName Description of the test scenario
     * @param expectedError Expected error type
     * @param overrides Configuration overrides for extreme values
     */
    async function testOverflowScenario(
      testName: string,
      expectedError: number,
      overrides: FeeQuoterOverrides = {},
    ) {
      await feequoterOverwrite(overrides)

      // Create message with specified parameters
      const dataSize = overrides.dataSize ?? 10
      const gasLimit = overrides.gasLimit ?? BigInt(FeeQuoterSetup.MAX_GAS_LIMIT)

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: asSnakeBytes(Buffer.alloc(dataSize)),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: gasLimit,
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }

      await setup.assertGetFeeValidationError(message, expectedError)
    }

    /**
     * Helper function to test success scenarios with configurable parameters
     * @param testName Description of the test scenario
     * @param overrides Configuration overrides for extreme values
     */
    async function testSuccessScenario(testName: string, overrides: FeeQuoterOverrides = {}) {
      await feequoterOverwrite(overrides)

      // Create message with specified parameters
      const dataSize = overrides.dataSize ?? 10
      const gasLimit = overrides.gasLimit ?? BigInt(FeeQuoterSetup.MAX_GAS_LIMIT)

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: asSnakeBytes(Buffer.alloc(dataSize)),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: gasLimit,
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }
      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      return result.fee
    }

    it('should handle extreme gas price that could cause message fee too high error', async () => {
      await testOverflowScenario(
        'extreme gas price causing MessageFeeTooHigh',
        feeQuoter.errors.MessageFeeTooHigh,
        {
          // Max uint112 gas prices
          executionGasPrice: 2n ** 112n - 1n,
          dataAvailabilityGasPrice: 2n ** 112n - 1n,
          // Very small token price to maximize final fee amount
          feeTokenPrice: 1n,
        },
      )
    })

    it('should handle extreme gas price that could cause overflow in final fee calculation', async () => {
      await testOverflowScenario(
        'extreme gas price causing FeeOverflow',
        feeQuoter.errors.FeeOverflow,
        {
          // Max uint112 gas prices
          executionGasPrice: 2n ** 112n - 1n,
          dataAvailabilityGasPrice: 2n ** 112n - 1n,
          // Very small token price to maximize final fee amount
          feeTokenPrice: 1n,
          linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e18), // Inflate link price to prevent MessageFeeTooHigh error
        },
      )
    })

    it('should never throw premium fee overflow', async () => {
      const fee = await testSuccessScenario('premium fee overflow', {
        // Analysis: premiumMultiplier is uint64, so max value is 2^64-1
        // premiumFeeUsdWei = networkFeeUsdCents * VAL_1E16
        // premiumFee = premiumFeeUsdWei * premiumMultiplier
        // With max values: (2^32-1) * 10^16 * (2^64-1) = very large but likely within int257
        // This overflow may not be achievable with realistic constraints
        networkFeeUsdCents: 2 ** 32 - 1, // Max uint32
        premiumMultiplier: 2n ** 64n - 1n, // Max uint64
        linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e18), // Inflate link price to prevent MessageFeeTooHigh error
      })
      const bitCount = fee.feeTokenAmount.toString(2).length
      expect(bitCount).toBeLessThanOrEqual(257) // Ensure fits within uint257
    })

    it('should never throw execution cost overflow', async () => {
      // Most execution cost overflows are unlikely with given constraints
      // int257 max ≈ 2^256, but realistic input combinations won't reach this
      const fee = await testSuccessScenario(
        'execution cost with max realistic values (should succeed)',
        {
          // Use maximum allowed values within serialization constraints
          executionGasPrice: 2n ** 112n - 1n, // Max uint112
          dataAvailabilityGasPrice: 2n ** 112n - 1n, // Max uint112
          gasMultiplierWeiPerEth: 2n ** 64n - 1n, // Max uint64
          gasLimit: BigInt(2 ** 32 - 1), // Max uint32
          destGasOverhead: 2 ** 32 - 1, // Max uint32
          destGasPerDataAvailabilityByte: 2 ** 16 - 1, // Max uint16
          destDataAvailabilityOverheadGas: 2 ** 32 - 1, // Max uint32
          destGasPerPayloadByteBase: 255, // Max uint8
          destGasPerPayloadByteHigh: 255, // Max uint8
          destGasPerPayloadByteThreshold: 1, // Trigger high calculation
          maxPerMsgGasLimit: 2 ** 32 - 1, // Allow max gas
          dataSize: 16000,
          maxDataBytes: 16001,
          linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
        },
      )
      const bitCount = fee.feeTokenAmount.toString(2).length
      expect(bitCount).toBeLessThanOrEqual(257) // Ensure fits within uint257
    })

    it('should handle token price too low error', async () => {
      await testOverflowScenario('token price too low', feeQuoter.errors.TokenPriceTooLow, {
        feeTokenPrice: 0n, // Zero token price should trigger error
      })
    })

    it('should never throw data availability cost overflow', async () => {
      const overrides = {
        dataAvailabilityGasPrice: 2n ** 112n - 1n, // Max uint112
        destDataAvailabilityOverheadGas: 2 ** 32 - 1, // Max uint32
        destGasPerDataAvailabilityByte: 2 ** 16 - 1, // Max uint16 (65535)
        destDataAvailabilityMultiplierBps: 2 ** 16 - 1, // Max uint16 (65535)
        dataSize: 16000,
        maxDataBytes: 16001,
        linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
      }

      // Combine max values to try to trigger DA overflow
      // DA calculation:
      const daLengthCost =
        BigInt(overrides.dataSize) * BigInt(overrides.destGasPerDataAvailabilityByte)
      const dataAvailabilityGas = daLengthCost + BigInt(overrides.destDataAvailabilityOverheadGas)
      //
      const daPrice = overrides.dataAvailabilityGasPrice * dataAvailabilityGas
      const daWithMultiplier = daPrice * BigInt(overrides.destDataAvailabilityMultiplierBps)
      const VAL_1E14 = 100000000000000n
      const dataAvailabilityCost = daWithMultiplier * VAL_1E14

      // Sanity check - this can't exceed int257 max (2^256)
      const int257Max = 2n ** 256n - 1n
      expect(dataAvailabilityCost).toBeLessThanOrEqual(int257Max)

      await testSuccessScenario('data availability cost overflow', overrides)
    })

    it('should never throw fee calculation overflow when adding premium + execution + DA costs', async () => {
      const overrides = {
        // Create scenario where premiumFee + executionCost + dataAvailabilityCost overflows uint256
        // This is the intermediate calculation before dividing by token price
        executionGasPrice: 2n ** 111n, // Very high execution gas price
        dataAvailabilityGasPrice: 2n ** 111n, // Very high DA gas price
        networkFeeUsdCents: 2 ** 32 - 1, // Max network fee
        premiumMultiplier: 2n ** 63n, // Very high premium multiplier
        gasMultiplierWeiPerEth: 2n ** 63n, // Very high gas multiplier
        destDataAvailabilityMultiplierBps: 2 ** 16 - 1, // Max DA multiplier
        gasLimit: BigInt(2 ** 32 - 1), // Max gas limit
        destGasOverhead: 2 ** 32 - 1, // Max gas overhead
        destGasPerDataAvailabilityByte: 2 ** 16 - 1, // Max DA byte cost
        destDataAvailabilityOverheadGas: 2 ** 32 - 1, // Max DA overhead
        maxPerMsgGasLimit: 2 ** 32 - 1, // Allow max gas
        dataSize: 16000, // Data size to calculate DA cost
        maxDataBytes: 2 ** 32 - 1, // Max allowed data size
        feeTokenPrice: 2n ** 200n, // Very high token price (so final division doesn't overflow)
        linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
      }

      // Calculate the three components that will be added together
      // 1. Premium Fee = networkFeeUsdCents * VAL_1E16 * premiumMultiplier
      const premiumFeeUsdWei = BigInt(overrides.networkFeeUsdCents) * BigInt(1e16)
      const premiumFee = premiumFeeUsdWei * overrides.premiumMultiplier

      // 2. Execution Cost = executionGasPrice * executionGas * gasMultiplierWeiPerEth
      const executionGas =
        overrides.gasLimit + BigInt(overrides.destGasOverhead) + BigInt(overrides.dataSize) * 255n // Simplified calldata calculation
      const executionCost =
        overrides.executionGasPrice * executionGas * overrides.gasMultiplierWeiPerEth

      // 3. Data Availability Cost (similar to other test)
      const TON_2_EVM_MESSAGE_FIXED_BYTES = 320n // Approximate
      const dataAvailabilityLengthBytes = TON_2_EVM_MESSAGE_FIXED_BYTES + BigInt(overrides.dataSize)
      const daLengthCost =
        dataAvailabilityLengthBytes * BigInt(overrides.destGasPerDataAvailabilityByte)
      const dataAvailabilityGas = daLengthCost + BigInt(overrides.destDataAvailabilityOverheadGas)
      const daPrice = overrides.dataAvailabilityGasPrice * dataAvailabilityGas
      const daWithMultiplier = daPrice * BigInt(overrides.destDataAvailabilityMultiplierBps)
      const dataAvailabilityCost = daWithMultiplier * BigInt(1e14)

      // Check if the sum would overflow uint256
      const uint256Max = 2n ** 256n - 1n
      const totalCost = premiumFee + executionCost + dataAvailabilityCost

      // If our calculation shows it should overflow, expect the error
      expect(totalCost).toBeLessThanOrEqual(uint256Max)
      await testSuccessScenario('fee calculation should not overflow with max values', overrides)
    })

    it('should handle final fee overflow when casting to uint120', async () => {
      await testOverflowScenario(
        'final fee overflow when casting to uint120',
        feeQuoter.errors.FeeOverflow,
        {
          // Try to create a fee that exceeds uint120 max (2^120 - 1 ≈ 1.3e36)
          // Final fee = (premiumFee + executionCost + dataAvailabilityCost) / tokenPrice
          // To exceed uint120: need result > 2^120
          executionGasPrice: 2n ** 111n, // Very high but within uint112
          dataAvailabilityGasPrice: 2n ** 111n, // Very high but within uint112
          networkFeeUsdCents: 2 ** 32 - 1, // Max uint32
          premiumMultiplier: 2n ** 50n, // Large premium multiplier
          gasMultiplierWeiPerEth: 2n ** 63n, // Near max uint64
          destDataAvailabilityMultiplierBps: 2 ** 16 - 1, // Max uint16
          feeTokenPrice: 1n, // Very small token price to maximize final result
          gasLimit: 2n ** 32n - 1n, // Max gas limit
          destGasOverhead: 2 ** 32 - 1, // Max overhead
          maxPerMsgGasLimit: 2 ** 32 - 1,
          dataSize: 10000, // Large data size
          maxDataBytes: 10001,
          linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
        },
      )
    })
  })

  // extraArgs validation
  const validEVMExtraArgs: ExtraArgs = {
    kind: 'generic-v2',
    gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
    allowOutOfOrderExecution: true,
  }
  describe('EVMExtraArgs', () => {
    it('valid extra args', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs.encode(validEVMExtraArgs).endCell(),
      }

      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    // NOTE: GasLimitTooHigh already tested above as "should revert when gas limit too high"
  })

  describe('SVMExtraArgs', () => {
    const validSVMExtraArgs: ExtraArgs = {
      kind: 'svm-v1',
      computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
      accountIsWritableBitMap: 0n,
      allowOutOfOrderExecution: true,
      tokenReceiver: Buffer.alloc(32),
      accounts: [Buffer.alloc(32)],
    }

    it('valid extra args', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs.encode(validSVMExtraArgs).endCell(),
      }

      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    it('reverts with empty extra args', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: beginCell().endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    it('reverts with invalid tag', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs.encode(validEVMExtraArgs).endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    it('reverts if out of order execution is false', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            ...validSVMExtraArgs,
            allowOutOfOrderExecution: false,
          })
          .endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.ExtraArgOutOfOrderExecutionMustBeTrue,
      )
    })
  })

  describe('SuiExtraArgs', () => {
    const validSVMExtraArgs: ExtraArgs = {
      kind: 'sui-v1',
      gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
      allowOutOfOrderExecution: true,
      tokenReceiver: Buffer.alloc(32),
      receiverObjectIds: [Buffer.alloc(32)],
    }

    it('valid extra args', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs.encode(validSVMExtraArgs).endCell(),
      }

      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    it('reverts with empty extra args', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: beginCell().endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    it('reverts with invalid tag', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs.encode(validEVMExtraArgs).endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    it('reverts if out of order execution is false', async () => {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            ...validSVMExtraArgs,
            allowOutOfOrderExecution: false,
          })
          .endCell(),
      }
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.ExtraArgOutOfOrderExecutionMustBeTrue,
      )
    })
  })

  // Additional error path tests
  describe('Message Data Error Codes', () => {
    it('should throw InvalidMsgData error for not divisible by eight snake data', async () => {
      // Create a message with invalid data size (not divisible by eight)
      const invalidSnakeCell = beginCell().storeUint(3, 3).endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: invalidSnakeCell,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidMsgData)
    })

    it('should throw InvalidMsgData error for snake data over 128 cells', async () => {
      // create a cell chain longer than 128 cells
      let invalidSnakeCell: Cell = beginCell().endCell()
      for (let i = 0; i <= 129; i++) {
        const newCell = beginCell().storeUint(i, 8).endCell()
        if (i === 0) {
          invalidSnakeCell = newCell
        } else {
          invalidSnakeCell = beginCell().storeRef(invalidSnakeCell).endCell()
        }
      }

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: invalidSnakeCell,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.MsgDataTooLarge)
    })
  })

  describe('Chain Family Selector Errors', () => {
    it('should throw UnsupportedChainFamilySelector error', async () => {
      // Create a destination chain config with invalid family selector
      const invalidFamilySelector = 0x99999999

      const result = await setup.bind.feeQuoter.sendUpdateDestChainConfigs(
        setup.acc.owner.getSender(),
        {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: 88888n,
              config: {
                ...FeeQuoterSetup.destChainConfig,
                chainFamilySelector: invalidFamilySelector,
              },
            },
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })

      const message: rt.CCIPSend = {
        destChainSelector: 88888n,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }

      await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.UnsupportedChainFamilySelector,
      )
    })
  })

  describe('Cross-Chain Address Validation', () => {
    const EVM_PRECOMPILE_SPACE = 1024
    const APTOS_PRECOMPILE_SPACE = 0x0b

    describe('EVM Address Validation', () => {
      it('should accept valid EVM address', async () => {
        // Valid EVM address (20 bytes, above precompile space)
        const validEvmAddress = Buffer.alloc(32)
        validEvmAddress.writeUInt32BE(0x1000, 28) // Address 0x1000 (above precompile space)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          receiver: validEvmAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject EVM address in precompile space', async () => {
        // Address below EVM_PRECOMPILE_SPACE (1024)
        const precompileAddress = Buffer.alloc(32)
        precompileAddress.writeUInt32BE(100, 28) // Address 100 (in precompile space)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          receiver: precompileAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }
        await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidEVMReceiverAddress)
      })

      it('should reject EVM address exceeding uint160 max', async () => {
        // Address larger than uint160 max
        const oversizedAddress = Buffer.alloc(32)
        // Set a bit beyond uint160 range
        oversizedAddress[10] = 0x01 // This sets a bit in position > 160

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          receiver: oversizedAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidEVMReceiverAddress)
      })

      it('should accept EVM address at precompile boundary', async () => {
        // Address exactly at EVM_PRECOMPILE_SPACE (1024)
        const boundaryAddress = Buffer.alloc(32)
        boundaryAddress.writeUInt32BE(EVM_PRECOMPILE_SPACE, 28)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          receiver: boundaryAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })
    })

    describe('SVM Address Validation', () => {
      it('should accept valid 32-byte SVM address with non-zero gas limit', async () => {
        const validSvmAddress = Buffer.alloc(32, 1) // Non-zero address

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
          receiver: validSvmAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'svm-v1',
              computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
              accountIsWritableBitMap: 0n,
              tokenReceiver: Buffer.alloc(32),
              accounts: [],
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should accept zero SVM address with zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
          receiver: zeroAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'svm-v1',
              computeUnits: 0n, // Zero compute units
              allowOutOfOrderExecution: true,
              accountIsWritableBitMap: 0n,
              tokenReceiver: Buffer.alloc(32),
              accounts: [],
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject zero SVM address with non-zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
          receiver: zeroAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'svm-v1',
              computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT), // Non-zero
              allowOutOfOrderExecution: true,
              accountIsWritableBitMap: 0n,
              tokenReceiver: Buffer.alloc(32),
              accounts: [],
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.errors.Invalid32ByteReceiverAddress,
        )
      })
    })

    describe('Aptos Address Validation', () => {
      it('should accept valid Aptos address above precompile space', async () => {
        const validAptosAddress = Buffer.alloc(32)
        validAptosAddress[31] = APTOS_PRECOMPILE_SPACE + 1

        // We need to add Aptos chain config first
        await setup.bind.feeQuoter.sendUpdateDestChainConfigs(setup.acc.owner.getSender(), {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: 77777n,
              config: {
                ...FeeQuoterSetup.destChainConfig,
                chainFamilySelector: 0xac77ffec, // CHAIN_FAMILY_SELECTOR_APTOS
              },
            },
          ],
        })

        const message: rt.CCIPSend = {
          destChainSelector: 77777n,
          receiver: validAptosAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject Aptos address in precompile space', async () => {
        const precompileAddress = Buffer.alloc(32)
        precompileAddress[31] = APTOS_PRECOMPILE_SPACE - 1

        await setup.bind.feeQuoter.sendUpdateDestChainConfigs(setup.acc.owner.getSender(), {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: 77777n,
              config: {
                ...FeeQuoterSetup.destChainConfig,
                chainFamilySelector: 0xac77ffec, // CHAIN_FAMILY_SELECTOR_APTOS
              },
            },
          ],
        })

        const message: rt.CCIPSend = {
          destChainSelector: 77777n,
          receiver: precompileAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'generic-v2',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.errors.Invalid32ByteReceiverAddress,
        )
      })
    })

    describe('SUI Address Validation', () => {
      it('should accept valid SUI address with non-zero gas limit', async () => {
        const validSuiAddress = Buffer.alloc(32)
        validSuiAddress[31] = APTOS_PRECOMPILE_SPACE + 1

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: validSuiAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [],
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should accept zero SUI address with zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: zeroAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: 0n,
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [],
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject SUI address below precompile space with non-zero gas limit', async () => {
        const precompileAddress = Buffer.alloc(32)
        precompileAddress[31] = APTOS_PRECOMPILE_SPACE - 1

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: precompileAddress,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [],
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.errors.Invalid32ByteReceiverAddress,
        )
      })

      it('should throw when receiver is zero with gas limit higher than 0', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: zeroReceiver,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [Buffer.alloc(32, 1)], // Non-empty receiver object IDs
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.errors.Invalid32ByteReceiverAddress,
        )
      })

      it('receiver can be zero when gas limit is zero and objectIds is empty', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: zeroReceiver,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: 0n,
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [],
            })
            .endCell(),
        }

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should fail when SUI receiver is zero with gas limit zero but non empty receiverObjectIds', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
          receiver: zeroReceiver,
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.builder.data.extraArgs
            .encode({
              kind: 'sui-v1',
              gasLimit: 0n,
              allowOutOfOrderExecution: true,
              tokenReceiver: Buffer.alloc(32),
              receiverObjectIds: [Buffer.alloc(32, 1)],
            })
            .endCell(),
        }

        await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidSuiReceiverAddress)
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_getValidatedPrices_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
