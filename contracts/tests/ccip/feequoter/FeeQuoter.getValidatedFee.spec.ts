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
        message.feeToken!,
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
      message.feeToken!,
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
        message.feeToken!,
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
      op: feeQuoter.opcodes.out.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          feeQuoter.builder.message.out.messageValidationFailed,
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
      op: feeQuoter.opcodes.out.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          feeQuoter.builder.message.out.messageValidationFailed,
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
      op: feeQuoter.opcodes.out.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          feeQuoter.builder.message.out.messageValidationFailed,
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
      op: feeQuoter.opcodes.out.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          feeQuoter.builder.message.out.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.errors.GasLimitTooHigh)
            },
          ],
        )
      },
    })
  })

  it.skip('should revert when fee token not supported', async () => {
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
      op: feeQuoter.opcodes.out.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
          x,
          feeQuoter.builder.message.out.messageValidationFailed,
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
      // create a cell chain longer than 128 cells; every non-terminal cell must
      // be byte-full (127 bytes) for the canonical-snake check to reach the
      // cell-count limit rather than reject the shape first
      let invalidSnakeCell: Cell = beginCell().endCell()
      for (let i = 0; i <= 129; i++) {
        const newCell = beginCell().storeBuffer(Buffer.alloc(127, i)).endCell()
        if (i === 0) {
          invalidSnakeCell = newCell
        } else {
          invalidSnakeCell = beginCell()
            .storeBuffer(Buffer.alloc(127, i))
            .storeRef(invalidSnakeCell)
            .endCell()
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
    const SUI_PRECOMPILE_SPACE = 0xdee9

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

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_APTOS,
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

        const message: rt.CCIPSend = {
          destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_APTOS,
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
        validSuiAddress[28] = 0xd
        validSuiAddress[29] = 0xe
        validSuiAddress[30] = 0xe
        validSuiAddress[31] = 9 + 1

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

  // -------------------------------------------------------------------------
  // Audit 2026:09 regression tests (F1-F4)
  // -------------------------------------------------------------------------
  describe('Audit 2026:09 - canonical snake and library-reference hardening', () => {
    const evmGenericArgs = (): Cell =>
      rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: true,
        })
        .endCell()

    // F1: a tagged GenericExtraArgsV2 that omits the optional gasLimit must be
    // resolved to the default before being echoed, never re-encoded as null.
    it('F1: resolves an absent EVMExtraArgsV2 gasLimit to the default (no null in reply)', async () => {
      // Encode via the binding with gasLimit omitted: the codec stores the
      // maybe-bit as absent, which is exactly the malformed input under test.
      const noGasArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          allowOutOfOrderExecution: true,
        })
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: noGasArgs,
      }

      const validated = await setup.getValidatedFee(message)
      // The echoed extra args must decode via the binding and carry a
      // present 256-bit gas limit (the default), never an absent maybe.
      const echoed = rt.builder.data.extraArgs.load(validated.msg.extraArgs.beginParse())
      if (echoed.kind !== 'generic-v2') {
        throw new Error(
          `Expected echoed extraArgs to be of kind "generic-v2", but got "${echoed.kind}"`,
        )
      }
      expect(echoed.gasLimit).toBeDefined() // gasLimit is present, not null
      expect(echoed.gasLimit).toBe(BigInt(FeeQuoterSetup.GAS_LIMIT))
      expect(echoed.allowOutOfOrderExecution).toBe(true) // allowOutOfOrderExecution preserved
    })

    // F2: branched `data` must be rejected (aggregate counting would accept it).
    it('F2: rejects branched message.data', async () => {
      const leafA = beginCell().storeUint(1, 8).endCell()
      const leafB = beginCell().storeUint(2, 8).endCell()
      const branched = beginCell().storeRef(leafA).storeRef(leafB).endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: branched,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: evmGenericArgs(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidMsgData)
    })

    // F2: a mid-chain partial cell must be rejected (Go decoder pads it).
    it('F2: rejects a non-byte-full non-terminal message.data cell', async () => {
      const tail = beginCell().storeUint(0, 8).endCell()
      const headPartial = beginCell().storeUint(0, 4).storeRef(tail).endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: headPartial,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: evmGenericArgs(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidMsgData)
    })

    // F2/F4: a library-reference cell for message.data must be rejected.
    it('F2: rejects a library-reference message.data cell', async () => {
      const libRef = beginCell()
        .storeUint(2, 8) // exotic type: LibraryReference
        .storeBuffer(Buffer.alloc(32, 0xab))
        .endCell({ exotic: true })

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: libRef,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: evmGenericArgs(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidMsgData)
    })

    // F4 Variant A: a library-reference `tokenAmounts` cell that resolves to an
    // empty cell must be rejected rather than echoed verbatim.
    it('F4: rejects a library-reference tokenAmounts cell (resolving to empty)', async () => {
      const libRef = beginCell()
        .storeUint(2, 8)
        .storeBuffer(Buffer.alloc(32, 0xcd))
        .endCell({ exotic: true })

      // Build the fee-quoter request body manually so we can inject the exotic
      // tokenAmounts cell that the typed builder would never emit; every other
      // field uses the typed bindings and exported opcodes.
      const ccipSendBody = beginCell()
        .storeUint(rt.opcodes.in.ccipSend, 32)
        .storeUint(0, 64) // queryID
        .storeUint(FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM, 64)
        .storeBuilder(rt.builder.data.crossChainAddress.encode(FeeQuoterSetup.DEST_ADDRESS))
        .storeRef(Cell.EMPTY) // data
        .storeRef(libRef) // tokenAmounts (exotic!)
        .storeAddress(FeeQuoterSetup.NATIVE_TON.token)
        .storeRef(evmGenericArgs())
        .endCell()

      const body = beginCell()
        .storeUint(feeQuoter.opcodes.in.getValidatedFee, 32)
        .storeRef(ccipSendBody)
        .endCell() // empty context slice

      await setup.assertGetFeeValidationErrorRaw(body, feeQuoter.errors.UnsupportedNumberOfTokens)
    })

    // F3: an SVM accounts snake with an element straddling a cell boundary must
    // be rejected (aggregate `size()` would accept it).
    it('F3: rejects SVM accounts split across a cell boundary', async () => {
      // 256-bit account split: 128 bits in the outer cell, 128 bits in the ref.
      const accountsSplit = beginCell()
        .storeBuffer(Buffer.alloc(16, 1), 16) // first half of account 0
        .storeRef(beginCell().storeBuffer(Buffer.alloc(16, 2), 16).endCell()) // second half
        .endCell()

      const extraArgs = beginCell()
        .storeUint(rt.ExtraArgsOpcodes.svmV1, 32)
        .storeUint(FeeQuoterSetup.GAS_LIMIT, 32) // computeUnits
        .storeUint(0, 64) // accountIsWritableBitmap
        .storeBit(true) // allowOutOfOrderExecution
        .storeBuffer(Buffer.alloc(32), 32) // tokenReceiver
        .storeRef(accountsSplit)
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidExtraArgsData)
    })

    // F3: an SVM accounts snake with a truncated trailing element must be rejected.
    it('F3: rejects SVM accounts with a truncated element', async () => {
      // 256 + 128 bits: aggregate 384 bits divides by 8 and by 32, but the last
      // element is incomplete.
      const accountsTruncated = beginCell()
        .storeBuffer(Buffer.alloc(32, 1), 32)
        .storeBuffer(Buffer.alloc(16, 2), 16)
        .endCell()

      const extraArgs = beginCell()
        .storeUint(rt.ExtraArgsOpcodes.svmV1, 32)
        .storeUint(FeeQuoterSetup.GAS_LIMIT, 32)
        .storeUint(0, 64)
        .storeBit(true)
        .storeBuffer(Buffer.alloc(32), 32)
        .storeRef(accountsTruncated)
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidExtraArgsData)
    })

    // F3/F4: a library-reference SVM accounts cell must be rejected.
    it('F3: rejects a library-reference SVM accounts cell', async () => {
      const libRef = beginCell()
        .storeUint(2, 8)
        .storeBuffer(Buffer.alloc(32, 0xef))
        .endCell({ exotic: true })

      const extraArgs = beginCell()
        .storeUint(rt.ExtraArgsOpcodes.svmV1, 32)
        .storeUint(FeeQuoterSetup.GAS_LIMIT, 32)
        .storeUint(0, 64)
        .storeBit(true)
        .storeBuffer(Buffer.alloc(32), 32)
        .storeRef(libRef)
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidExtraArgsData)
    })

    // Control: a well-formed multi-cell SVM accounts snake is still accepted.
    // Four accounts (4 x 256 bits) exceed the 1023-bit cell budget, so the
    // codec splits the accounts snake into an intermediate cell holding three
    // accounts plus a continuation ref, and a tail cell holding the fourth —
    // exercising the continuation traversal for a valid fixed-width snake.
    it('F3: accepts a canonical multi-cell SVM accounts snake', async () => {
      const extraArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'svm-v1',
          computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
          accountIsWritableBitMap: 0n,
          allowOutOfOrderExecution: true,
          tokenReceiver: Buffer.alloc(32),
          accounts: [
            Buffer.alloc(32, 1),
            Buffer.alloc(32, 2),
            Buffer.alloc(32, 3),
            Buffer.alloc(32, 4),
          ],
        })
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    // F2: a byte snake whose terminal cell carries a partial byte. The
    // `bits % 8 != 0` branch is unreachable through the typed message builder
    // (it writes whole bytes), so the data cell is built by hand.
    it('F2: rejects a byte snake with a non-byte-aligned terminal cell', async () => {
      // A canonical linear chain (one continuation ref per non-terminal cell)
      // whose terminal cell holds 4 bits, i.e. a partial byte.
      const partialTail = beginCell().storeUint(3, 4).endCell()
      const data = beginCell()
        .storeBuffer(Buffer.alloc(127, 1)) // byte-full non-terminal cell
        .storeRef(partialTail)
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: evmGenericArgs(),
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.InvalidMsgData)
    })

    // F3: the SVM accounts-count error must name the SVM failure, not the Sui
    // one. Previously this threw TooManySuiExtraArgsReceiverObjectIds.
    it('F3: reports TooManySVMExtraArgsAccounts (not the Sui error) for too many accounts', async () => {
      const extraArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'svm-v1',
          computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
          accountIsWritableBitMap: 0n,
          allowOutOfOrderExecution: true,
          tokenReceiver: Buffer.alloc(32),
          // SVM_EXTRA_ARGS_MAX_ACCOUNTS is 64; the accounts count is checked
          // before the expanded-data budget.
          accounts: Array.from({ length: 65 }, (_, i) => Buffer.alloc(32, i + 1)),
        })
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      await setup.assertGetFeeValidationError(message, feeQuoter.errors.TooManySVMExtraArgsAccounts)
    })

    // SVM `accountIsWritableBitmap` must not address accounts the message does
    // not carry, otherwise the destination cannot execute the message as
    // requested. Mirrors EVM FeeQuoter's InvalidSVMExtraArgsWritableBitmap.
    it('F3: rejects an SVM writable bitmap addressing accounts beyond the list', async () => {
      const extraArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'svm-v1',
          computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
          // bit 3 set while only 3 accounts (bits 0..2) are carried
          accountIsWritableBitMap: 1n << 3n,
          allowOutOfOrderExecution: true,
          tokenReceiver: Buffer.alloc(32),
          accounts: [Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3)],
        })
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      await setup.assertGetFeeValidationError(
        message,
        feeQuoter.errors.InvalidSVMExtraArgsWritableBitmap,
      )
    })

    // Control: a bitmap that addresses exactly the carried accounts is valid.
    it('F3: accepts an SVM writable bitmap within the account count', async () => {
      const extraArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'svm-v1',
          computeUnits: BigInt(FeeQuoterSetup.GAS_LIMIT),
          accountIsWritableBitMap: 0b101n, // bits 0..2, all within 3 accounts
          allowOutOfOrderExecution: true,
          tokenReceiver: Buffer.alloc(32),
          accounts: [Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3)],
        })
        .endCell()

      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs,
      }

      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    // Sui mirrors the SVM collection validation through a different call site
    // and a different field name, so it needs its own coverage.
    const suiExtraArgsWithObjectIds = (objectIds: Cell): Cell =>
      beginCell()
        .storeUint(rt.ExtraArgsOpcodes.suiV1, 32)
        .storeUint(FeeQuoterSetup.GAS_LIMIT, 256) // gasLimit (mandatory for Sui)
        .storeBit(true) // allowOutOfOrderExecution
        .storeBuffer(Buffer.alloc(32), 32) // tokenReceiver
        .storeRef(objectIds)
        .endCell()

    const suiMessage = (extraArgs: Cell): rt.CCIPSend => ({
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs,
    })

    it('F3: rejects Sui receiverObjectIds split across a cell boundary', async () => {
      const objectIdsSplit = beginCell()
        .storeBuffer(Buffer.alloc(16, 1), 16) // first half of object id 0
        .storeRef(beginCell().storeBuffer(Buffer.alloc(16, 2), 16).endCell())
        .endCell()

      await setup.assertGetFeeValidationError(
        suiMessage(suiExtraArgsWithObjectIds(objectIdsSplit)),
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    it('F3: rejects Sui receiverObjectIds with a truncated element', async () => {
      const objectIdsTruncated = beginCell()
        .storeBuffer(Buffer.alloc(32, 1), 32)
        .storeBuffer(Buffer.alloc(16, 2), 16)
        .endCell()

      await setup.assertGetFeeValidationError(
        suiMessage(suiExtraArgsWithObjectIds(objectIdsTruncated)),
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    // F4 variant B on the Sui call site: the FeeQuoter would resolve the library
    // reference while validating, then re-emit the descriptor.
    it('F3: rejects a library-reference Sui receiverObjectIds cell', async () => {
      const libRef = beginCell()
        .storeUint(2, 8)
        .storeBuffer(Buffer.alloc(32, 0xef))
        .endCell({ exotic: true })

      await setup.assertGetFeeValidationError(
        suiMessage(suiExtraArgsWithObjectIds(libRef)),
        feeQuoter.errors.InvalidExtraArgsData,
      )
    })

    // Control: a canonical Sui receiverObjectIds snake is still accepted.
    it('F3: accepts a canonical Sui receiverObjectIds snake', async () => {
      const extraArgs = rt.builder.data.extraArgs
        .encode({
          kind: 'sui-v1',
          gasLimit: BigInt(FeeQuoterSetup.GAS_LIMIT),
          allowOutOfOrderExecution: true,
          tokenReceiver: Buffer.alloc(32),
          receiverObjectIds: [Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3)],
        })
        .endCell()

      const result = await setup.getValidatedFee(suiMessage(extraArgs))
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
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
