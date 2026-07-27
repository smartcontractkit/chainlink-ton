import '@ton/test-utils'

import { toNano, beginCell, Cell } from '@ton/core'

import { FeeQuoterSetup, FeeQuoterFeeSetup, Token } from './FeeQuoterSetup'
import * as feeQuoterManual from '../../../wrappers/ccip/FeeQuoter'
import * as feeQuoter from '../../../wrappers/gen/ccip/FeeQuoter'
import * as sx from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as rt from '../../../wrappers/gen/ccip/Router'
import { asSnakeBytes } from '../../../src/utils'
import { verifyBodyMessage } from '../../utils/verifyMessageBody'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'
import { ChainSelectors } from '../../utils/Selectors'
import { FromBuffer } from '../../../wrappers/ccip/common/CrossChainAddressCodec'

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

      const gasUsed = FeeQuoterSetup.GAS_LIMIT + FeeQuoterSetup.DEST_GAS_OVERHEAD
      const gasFeeUSD =
        gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS
      const messageFeeUSD =
        FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
        premiumMultiplierWeiPerEth
      const calldataLen = BigInt(message.data.beginParse().remainingBits / 8)
      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        ChainSelectors.testnet.evm,
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
      ChainSelectors.testnet.evm,
    )
    // Update dest chain config to set data availability multiplier to 0
    {
      const result = await setup.bind.feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
        setup.acc.owner.getSender(),
        toNano('1'),
        {
          updates: [
            feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
              destChainSelector: ChainSelectors.testnet.evm,
              destChainConfig: {
                ...destChainConfig.config,
                destDataAvailabilityMultiplierBps: 0n,
              },
            }),
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

    const gasUsed = FeeQuoterSetup.GAS_LIMIT + FeeQuoterSetup.DEST_GAS_OVERHEAD
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
    const customGasLimit = FeeQuoterSetup.MAX_GAS_LIMIT
    const customDataSize = FeeQuoterSetup.MAX_DATA_SIZE
    expect(customDataSize).toBeGreaterThan(
      Number(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD),
    )

    for (const token of testTokens) {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: asSnakeBytes(Buffer.alloc(Number(customDataSize))),
        tokenAmounts: [],
        feeToken: token.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: customGasLimit,
          allowOutOfOrderExecution: true,
        }),
      })

      const result = await setup.getValidatedFee(message)

      // Verify fee calculation with high gas and large data
      const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        message.feeToken!,
      )

      const calldataLen = BigInt(customDataSize)

      // Calculate calldata cost with threshold
      const callDataCostHigh =
        (calldataLen - FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD) *
          FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_HIGH +
        FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD *
          FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE

      const gasUsed = customGasLimit + FeeQuoterSetup.DEST_GAS_OVERHEAD + callDataCostHigh

      const gasFeeUSD =
        gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS

      const messageFeeUSD =
        FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
        premiumMultiplierWeiPerEth

      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        ChainSelectors.testnet.evm,
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
    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: true,
      }),
    })

    const result = await setup.getValidatedFee(message)
    expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
  })

  // Error cases

  it('should allow fail when allow out of order execution is false', async () => {
    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: false,
      }),
    })

    await setup.assertGetFeeValidationError(
      message,
      feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue'],
    )
  })

  it('should revert when destination chain not enabled', async () => {
    const invalidChainSelector = ChainSelectors.testnet.evm + 1n
    const message = rt.Router_CCIPSend.create({
      destChainSelector: invalidChainSelector,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: false,
      }),
    })

    const result = await setup.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg: message, context: beginCell().asSlice() }),
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: feeQuoter.FeeQuoter_MessageValidationFailed.PREFIX,
      success: true,
      body(x) {
        return verifyBodyMessage<sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
          x,
          sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
          [
            (msg) => {
              return (
                msg.error ===
                BigInt(feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.DestChainNotEnabled'])
              )
              // return true
            },
          ],
        )
      },
    })
  })

  it('should revert when message too large', async () => {
    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: asSnakeBytes(Buffer.alloc(Number(FeeQuoterSetup.MAX_DATA_SIZE + 1n))),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: false,
      }),
    })

    const result = await setup.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg: message, context: beginCell().asSlice() }),
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: feeQuoter.FeeQuoter_MessageValidationFailed.PREFIX,
      success: true,
      body(x) {
        return verifyBodyMessage<sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
          x,
          sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
          [
            (msg) => {
              return (
                msg.error === BigInt(feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.MsgDataTooLarge'])
              )
            },
          ],
        )
      },
    })
  })

  it.skip('should revert when too many tokens', async () => {
    const tooManyTokens = [FeeQuoterSetup.SOURCE_FEE_TOKEN] // We don't support token transfers in TON yet

    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: tooManyTokens.map((token) =>
        rt.TokenAmount.create({
          token: token.token,
          amount: toNano('100'),
        }),
      ),
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: false,
      }),
    })

    const result = await setup.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg: message, context: beginCell().asSlice() }),
    )

    // Should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: feeQuoter.FeeQuoter_MessageValidationFailed.PREFIX,
      success: true,
      body(x) {
        return verifyBodyMessage<sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
          x,
          sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
          [
            (msg) => {
              return (
                msg.error ===
                BigInt(feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnsupportedNumberOfTokens'])
              )
            },
          ],
        )
      },
    })
  })

  it('accepts a token transfer and prices it like a token-less message', async () => {
    // Token transfers are now allowed; the extra token-transfer fee is currently ignored,
    // so a single-token message is priced exactly like the equivalent token-less message.
    const feeToken = FeeQuoterSetup.NATIVE_TON.token

    const withToken = setup.generateSingleTokenMessage({
      token: FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
      amount: toNano('100'),
      feeToken,
    })
    const withoutToken = setup.generateEmptyMessage({ feeToken })

    // getValidatedFee throws if validation fails, so reaching the assertion proves acceptance.
    const tokenFee = await setup.getValidatedFee(withToken)
    const emptyFee = await setup.getValidatedFee(withoutToken)

    expect(tokenFee.fee.feeTokenAmount).toEqual(emptyFee.fee.feeTokenAmount)
  })

  it('should revert when gas limit too high', async () => {
    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: FeeQuoterSetup.NATIVE_TON.token,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.MAX_GAS_LIMIT + 1n,
        allowOutOfOrderExecution: false,
      }),
    })

    const result = await setup.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg: message, context: beginCell().asSlice() }),
    )

    // should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: feeQuoter.FeeQuoter_MessageValidationFailed.PREFIX,
      success: true,
      body(x) {
        return verifyBodyMessage<sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
          x,
          sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
          [
            (msg) => {
              return (
                msg.error === BigInt(feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.GasLimitTooHigh'])
              )
            },
          ],
        )
      },
    })
  })

  it.skip('should revert when fee token not supported', async () => {
    const notAFeeToken = FeeQuoterSetup.CUSTOM_TOKEN.token

    const message = rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: notAFeeToken,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: false,
      }),
    })

    const result = await setup.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      setup.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg: message, context: beginCell().asSlice() }),
    )

    // should return failure - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      from: setup.acc.externalCaller.getSender().address,
      to: setup.bind.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.bind.feeQuoter.address,
      op: feeQuoter.FeeQuoter_MessageValidationFailed.PREFIX,
      success: true,
      body(x) {
        return verifyBodyMessage<sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
          x,
          sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
          [
            (msg) => {
              return (
                msg.error ===
                BigInt(feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeTokenNotSupported'])
              )
            },
          ],
        )
      },
    })
  })

  // Overflow/Underflow Edge Case Tests
  describe('Overflow and Underflow Edge Cases', () => {
    interface FeeQuoterOverrides extends Omit<Partial<feeQuoter.FeeQuoterDestChainConfig>, '$'> {
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
      const tokenPriceUpdates: feeQuoter.TokenPriceUpdate[] = [
        ...(overrides.feeTokenPrice === undefined
          ? []
          : [
              feeQuoter.TokenPriceUpdate.create({
                sourceToken: FeeQuoterSetup.NATIVE_TON.token,
                usdPerToken: overrides.feeTokenPrice,
              }),
            ]),
        ...(overrides.linkTokenPrice === undefined
          ? []
          : [
              feeQuoter.TokenPriceUpdate.create({
                sourceToken: FeeQuoterSetup.SOURCE_LINK.token,
                usdPerToken: overrides.linkTokenPrice,
              }),
            ]),
      ]

      // Set up gas prices if specified
      const priceUpdates = feeQuoter.PriceUpdates.create({
        tokenPriceUpdates,
        gasPriceUpdates:
          overrides.executionGasPrice !== undefined ||
          overrides.dataAvailabilityGasPrice !== undefined
            ? [
                feeQuoter.GasPriceUpdate.create({
                  destChainSelector: ChainSelectors.testnet.evm,
                  executionGasPrice: overrides.executionGasPrice ?? FeeQuoterSetup.USD_PER_GAS,
                  dataAvailabilityGasPrice:
                    overrides.dataAvailabilityGasPrice ??
                    FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
                }),
              ]
            : [],
      })

      // Update prices if needed
      if (priceUpdates.gasPriceUpdates.length > 0 || priceUpdates.tokenPriceUpdates.length > 0) {
        const updateResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
          setup.acc.owner.getSender(),
          toNano('1'),
          { updates: priceUpdates, sendExcessesTo: setup.acc.deployer.address },
        )
        expect(updateResult.transactions).toHaveTransaction({
          to: setup.bind.feeQuoter.address,
          success: true,
        })
      }

      // Get dest chain config keys for filtering
      const destChainConfigKeys = Object.keys(FeeQuoterSetup.destChainConfig).filter(
        (key): key is keyof Omit<feeQuoter.FeeQuoterDestChainConfig, '$'> => key !== '$',
      )

      // Update dest chain config if needed
      const hasDestConfigOverrides = Object.keys(overrides).some((key) =>
        destChainConfigKeys.includes(key as keyof Omit<feeQuoter.FeeQuoterDestChainConfig, '$'>),
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
              destChainConfigKeys.includes(
                key as keyof Omit<feeQuoter.FeeQuoterDestChainConfig, '$'>,
              ) && value !== undefined,
          ),
        ) as Omit<Partial<feeQuoter.FeeQuoterDestChainConfig>, '$'>

        const destChainConfigResult =
          await setup.bind.feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
            setup.acc.owner.getSender(),
            toNano('1'),
            {
              updates: [
                feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
                  destChainSelector: ChainSelectors.testnet.evm,
                  destChainConfig: {
                    ...FeeQuoterSetup.destChainConfig,
                    ...destConfigOverrides,
                  },
                }),
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
        const feeTokenResult = await setup.bind.feeQuoter.sendFeeQuoterUpdateFeeTokens(
          setup.acc.owner.getSender(),
          toNano('1'),
          {
            add: new Map([
              [
                FeeQuoterSetup.NATIVE_TON.token,
                feeQuoter.FeeToken.create({
                  premiumMultiplierWeiPerEth: overrides.premiumMultiplier,
                }),
              ],
            ]),
            remove: [],
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
      const gasLimit = overrides.gasLimit ?? FeeQuoterSetup.MAX_GAS_LIMIT

      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: asSnakeBytes(Buffer.alloc(dataSize)),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: gasLimit,
          allowOutOfOrderExecution: true,
        }),
      })

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
      const gasLimit = overrides.gasLimit ?? FeeQuoterSetup.MAX_GAS_LIMIT

      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: asSnakeBytes(Buffer.alloc(dataSize)),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: gasLimit,
          allowOutOfOrderExecution: true,
        }),
      })
      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      return result.fee
    }

    it('should handle extreme gas price that could cause message fee too high error', async () => {
      await testOverflowScenario(
        'extreme gas price causing MessageFeeTooHigh',
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.MessageFeeTooHigh'],
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
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeOverflow'],
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
        networkFeeUsdCents: BigInt(2 ** 32 - 1), // Max uint32
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
          destGasOverhead: BigInt(2 ** 32 - 1), // Max uint32
          destGasPerDataAvailabilityByte: BigInt(2 ** 16 - 1), // Max uint16
          destDataAvailabilityOverheadGas: BigInt(2 ** 32 - 1), // Max uint32
          destGasPerPayloadByteBase: 255n, // Max uint8
          destGasPerPayloadByteHigh: 255n, // Max uint8
          destGasPerPayloadByteThreshold: 1n, // Trigger high calculation
          maxPerMsgGasLimit: BigInt(2 ** 32 - 1), // Allow max gas
          dataSize: 16000,
          maxDataBytes: 16001n,
          linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
        },
      )
      const bitCount = fee.feeTokenAmount.toString(2).length
      expect(bitCount).toBeLessThanOrEqual(257) // Ensure fits within uint257
    })

    it('should handle token price too low error', async () => {
      await testOverflowScenario(
        'token price too low',
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.TokenPriceTooLow'],
        {
          feeTokenPrice: 0n, // Zero token price should trigger error
        },
      )
    })

    it('should never throw data availability cost overflow', async () => {
      const overrides = {
        dataAvailabilityGasPrice: 2n ** 112n - 1n, // Max uint112
        destDataAvailabilityOverheadGas: BigInt(2 ** 32 - 1), // Max uint32
        destGasPerDataAvailabilityByte: BigInt(2 ** 16 - 1), // Max uint16 (65535)
        destDataAvailabilityMultiplierBps: BigInt(2 ** 16 - 1), // Max uint16 (65535)
        dataSize: 16000,
        maxDataBytes: 16001n,
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
        networkFeeUsdCents: BigInt(2 ** 32 - 1), // Max network fee
        premiumMultiplier: 2n ** 63n, // Very high premium multiplier
        gasMultiplierWeiPerEth: 2n ** 63n, // Very high gas multiplier
        destDataAvailabilityMultiplierBps: BigInt(2 ** 16 - 1), // Max DA multiplier
        gasLimit: BigInt(2 ** 32 - 1), // Max gas limit
        destGasOverhead: BigInt(2 ** 32 - 1), // Max gas overhead
        destGasPerDataAvailabilityByte: BigInt(2 ** 16 - 1), // Max DA byte cost
        destDataAvailabilityOverheadGas: BigInt(2 ** 32 - 1), // Max DA overhead
        maxPerMsgGasLimit: BigInt(2 ** 32 - 1), // Allow max gas
        dataSize: 16000, // Data size to calculate DA cost
        maxDataBytes: BigInt(2 ** 32 - 1), // Max allowed data size
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
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeOverflow'],
        {
          // Try to create a fee that exceeds uint120 max (2^120 - 1 ≈ 1.3e36)
          // Final fee = (premiumFee + executionCost + dataAvailabilityCost) / tokenPrice
          // To exceed uint120: need result > 2^120
          executionGasPrice: 2n ** 111n, // Very high but within uint112
          dataAvailabilityGasPrice: 2n ** 111n, // Very high but within uint112
          networkFeeUsdCents: BigInt(2 ** 32 - 1), // Max uint32
          premiumMultiplier: 2n ** 50n, // Large premium multiplier
          gasMultiplierWeiPerEth: 2n ** 63n, // Near max uint64
          destDataAvailabilityMultiplierBps: BigInt(2 ** 16 - 1), // Max uint16
          feeTokenPrice: 1n, // Very small token price to maximize final result
          gasLimit: 2n ** 32n - 1n, // Max gas limit
          destGasOverhead: BigInt(2 ** 32 - 1), // Max overhead
          maxPerMsgGasLimit: BigInt(2 ** 32 - 1),
          dataSize: 10000, // Large data size
          maxDataBytes: 10001n,
          linkTokenPrice: FeeQuoterSetup.SOURCE_LINK.price * BigInt(1e36), // Inflate link price to prevent MessageFeeTooHigh error
        },
      )
    })
  })

  // extraArgs validation
  const validEVMExtraArgs = rt.GenericExtraArgsV2.create({
    gasLimit: FeeQuoterSetup.GAS_LIMIT,
    allowOutOfOrderExecution: true,
  })
  describe('EVMExtraArgs', () => {
    it('valid extra args', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: validEVMExtraArgs,
      })
      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    // NOTE: GasLimitTooHigh already tested above as "should revert when gas limit too high"
  })

  describe('SVMExtraArgs', () => {
    const validSVMExtraArgs = rt.SVMExtraArgsV1.create({
      computeUnits: FeeQuoterSetup.GAS_LIMIT,
      accountIsWritableBitmap: 0n,
      allowOutOfOrderExecution: true,
      tokenReceiver: 0n,
      accounts: [0n],
    })

    it('valid extra args', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.solana,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: validSVMExtraArgs,
      })
      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    it('reverts with empty extra args', async () => {
      const message = feeQuoterManual.FeeQuoter_GetValidatedFee_ToFeeQuoter.toCell({
        msg: {
          queryID: 0n,
          destChainSelector: ChainSelectors.testnet.solana,
          receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: beginCell().endCell(),
        },
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidExtraArgsData'],
      )
    })

    it('reverts with invalid tag', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.solana,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: validEVMExtraArgs,
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidExtraArgsData'],
      )
    })

    it('reverts if out of order execution is false', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.solana,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: {
          ...validSVMExtraArgs,
          allowOutOfOrderExecution: false,
        },
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue'],
      )
    })
  })

  describe('SuiExtraArgs', () => {
    const validSVMExtraArgs = rt.SuiExtraArgsV1.create({
      gasLimit: FeeQuoterSetup.GAS_LIMIT,
      allowOutOfOrderExecution: true,
      tokenReceiver: 0n,
      receiverObjectIds: [0n],
    })

    it('valid extra args', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.sui,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: validSVMExtraArgs,
      })
      const result = await setup.getValidatedFee(message)
      expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
    })

    it('reverts with empty extra args', async () => {
      const message = feeQuoterManual.FeeQuoter_GetValidatedFee_ToFeeQuoter.toCell({
        msg: {
          queryID: 0n,
          destChainSelector: ChainSelectors.testnet.solana,
          receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: beginCell().endCell(),
        },
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidExtraArgsData'],
      )
    })

    it('reverts with invalid tag', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.sui,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: validEVMExtraArgs,
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidExtraArgsData'],
      )
    })

    it('reverts if out of order execution is false', async () => {
      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.sui,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          ...validSVMExtraArgs,
          allowOutOfOrderExecution: false,
        }),
      })
      const result = await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue'],
      )
    })
  })

  // Additional error path tests
  describe('Message Data Error Codes', () => {
    it('should throw InvalidMsgData error for not divisible by eight snake data', async () => {
      // Create a message with invalid data size (not divisible by eight)
      const invalidSnakeCell = beginCell().storeUint(3, 3).endCell()

      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: invalidSnakeCell,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: FeeQuoterSetup.GAS_LIMIT,
          allowOutOfOrderExecution: true,
        }),
      })

      await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidMsgData'],
      )
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

      const message = rt.Router_CCIPSend.create({
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: invalidSnakeCell,
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: FeeQuoterSetup.GAS_LIMIT,
          allowOutOfOrderExecution: true,
        }),
      })

      await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.MsgDataTooLarge'],
      )
    })
  })

  describe('Chain Family Selector Errors', () => {
    it('should throw UnsupportedChainFamilySelector error', async () => {
      // Create a destination chain config with invalid family selector
      const invalidFamilySelector = 0x99999999

      const result = await setup.bind.feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
        setup.acc.owner.getSender(),
        toNano('1'),
        {
          updates: [
            feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
              destChainSelector: 88888n,
              destChainConfig: {
                ...FeeQuoterSetup.destChainConfig,
                chainFamilySelector: BigInt(invalidFamilySelector),
              },
            }),
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })

      const message = rt.Router_CCIPSend.create({
        destChainSelector: 88888n,
        receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.GenericExtraArgsV2.create({
          gasLimit: FeeQuoterSetup.GAS_LIMIT,
          allowOutOfOrderExecution: true,
        }),
      })

      await setup.assertGetFeeValidationError(
        message,
        feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnsupportedChainFamilySelector'],
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

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.evm,
          receiver: FromBuffer(validEvmAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject EVM address in precompile space', async () => {
        // Address below EVM_PRECOMPILE_SPACE (1024)
        const precompileAddress = Buffer.alloc(32)
        precompileAddress.writeUInt32BE(100, 28) // Address 100 (in precompile space)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.evm,
          receiver: FromBuffer(precompileAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })
        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidEVMReceiverAddress'],
        )
      })

      it('should reject EVM address exceeding uint160 max', async () => {
        // Address larger than uint160 max
        const oversizedAddress = Buffer.alloc(32)
        // Set a bit beyond uint160 range
        oversizedAddress[10] = 0x01 // This sets a bit in position > 160

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.evm,
          receiver: FromBuffer(oversizedAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidEVMReceiverAddress'],
        )
      })

      it('should accept EVM address at precompile boundary', async () => {
        // Address exactly at EVM_PRECOMPILE_SPACE (1024)
        const boundaryAddress = Buffer.alloc(32)
        boundaryAddress.writeUInt32BE(EVM_PRECOMPILE_SPACE, 28)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.evm,
          receiver: FromBuffer(boundaryAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })
    })

    describe('SVM Address Validation', () => {
      it('should accept valid 32-byte SVM address with non-zero gas limit', async () => {
        const validSvmAddress = Buffer.alloc(32, 1) // Non-zero address

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.solana,
          receiver: FromBuffer(validSvmAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SVMExtraArgsV1.create({
            computeUnits: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
            accountIsWritableBitmap: 0n,
            tokenReceiver: 0n,
            accounts: [],
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should accept zero SVM address with zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.solana,
          receiver: FromBuffer(zeroAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SVMExtraArgsV1.create({
            computeUnits: 0n, // Zero compute units
            allowOutOfOrderExecution: true,
            accountIsWritableBitmap: 0n,
            tokenReceiver: 0n,
            accounts: [],
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject zero SVM address with non-zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.solana,
          receiver: FromBuffer(zeroAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SVMExtraArgsV1.create({
            computeUnits: FeeQuoterSetup.GAS_LIMIT, // Non-zero
            allowOutOfOrderExecution: true,
            accountIsWritableBitmap: 0n,
            tokenReceiver: 0n,
            accounts: [],
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.Invalid32ByteReceiverAddress'],
        )
      })
    })

    describe('Aptos Address Validation', () => {
      it('should accept valid Aptos address above precompile space', async () => {
        const validAptosAddress = Buffer.alloc(32)
        validAptosAddress[31] = APTOS_PRECOMPILE_SPACE + 1

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.aptos,
          receiver: FromBuffer(validAptosAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject Aptos address in precompile space', async () => {
        const precompileAddress = Buffer.alloc(32)
        precompileAddress[31] = APTOS_PRECOMPILE_SPACE - 1

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.aptos,
          receiver: FromBuffer(precompileAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.GenericExtraArgsV2.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.Invalid32ByteReceiverAddress'],
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

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(validSuiAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [],
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should accept zero SUI address with zero gas limit', async () => {
        const zeroAddress = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(zeroAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: 0n,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [],
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should reject SUI address below precompile space with non-zero gas limit', async () => {
        const precompileAddress = Buffer.alloc(32)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(precompileAddress),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [],
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.Invalid32ByteReceiverAddress'],
        )
      })

      it('should throw when receiver is zero with gas limit higher than 0', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(zeroReceiver),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: FeeQuoterSetup.GAS_LIMIT,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [1n], // Non-empty receiver object IDs
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.Invalid32ByteReceiverAddress'],
        )
      })

      it('receiver can be zero when gas limit is zero and objectIds is empty', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(zeroReceiver),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: 0n,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [],
          }),
        })

        const result = await setup.getValidatedFee(message)
        expect(result.fee.feeTokenAmount).toBeGreaterThan(0n)
      })

      it('should fail when SUI receiver is zero with gas limit zero but non empty receiverObjectIds', async () => {
        const zeroReceiver = Buffer.alloc(32, 0)

        const message = rt.Router_CCIPSend.create({
          destChainSelector: ChainSelectors.testnet.sui,
          receiver: FromBuffer(zeroReceiver),
          data: beginCell().endCell(),
          tokenAmounts: [],
          feeToken: FeeQuoterSetup.NATIVE_TON.token,
          extraArgs: rt.SuiExtraArgsV1.create({
            gasLimit: 0n,
            allowOutOfOrderExecution: true,
            tokenReceiver: 0n,
            receiverObjectIds: [1n],
          }),
        })

        await setup.assertGetFeeValidationError(
          message,
          feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidSuiReceiverAddress'],
        )
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
