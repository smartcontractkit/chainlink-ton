import '@ton/test-utils'

import { toNano, Address, Cell, beginCell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { FeeQuoterSetup, FeeQuoterFeeSetup, Token } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'
import * as sendExec from '../../../wrappers/ccip/CCIPSendExecutor'
import * as rt from '../../../wrappers/ccip/Router'
import { asSnakeBytes, asSnakeData, ZERO_ADDRESS } from '../../../src/utils'
import { skip } from 'node:test'
import { verifyBodyMessage } from '../CCIPRouter.spec'

describe('FeeQuoter GetValidatedFee', () => {
  let setup: FeeQuoterFeeSetup

  beforeEach(async () => {
    setup = new FeeQuoterFeeSetup()
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('getValidatedFee')
  })

  it('should calculate fee for empty message', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS // Native TON and Link
    for (const token of testTokens) {
      var message = setup.generateEmptyMessage({
        feeToken: token.token,
      })

      // Get the validated fee using the helper method
      const messageValidated = await setup.getValidatedFee(message, beginCell().endCell())

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
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        calldataLen,
        BigInt(message.tokenAmounts.length),
        0n,
      )

      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price
      expect(messageValidated.fee).toEqual(totalPriceInFeeToken)
    }
  })

  it('should handle zero data availability multiplier', async () => {
    const destChainConfig = await setup.bind.feeQuoter.getDestChainConfig(
      FeeQuoterSetup.DEST_CHAIN_SELECTOR,
    )
    // Update dest chain config to set data availability multiplier to 0
    {
      const result = await setup.bind.feeQuoter.sendUpdateDestChainConfigs(
        setup.acc.owner.getSender(),
        {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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

    const feeResult = await setup.getValidatedFee(message, beginCell().endCell())

    const gasUsed = BigInt(FeeQuoterSetup.GAS_LIMIT) + BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD)
    const gasFeeUSD =
      gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS
    const messageFeeUSD =
      FeeQuoterSetup.configUSDCentToWei(FeeQuoterSetup.destChainConfig.networkFeeUsdCents) *
      premiumMultiplierWeiPerEth

    const totalPriceInFeeToken = (gasFeeUSD + messageFeeUSD) / FeeQuoterSetup.NATIVE_TON.price

    expect(feeResult.fee).toEqual(totalPriceInFeeToken)
  })

  it('should handle high gas limit message', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS
    const customGasLimit = BigInt(FeeQuoterSetup.MAX_GAS_LIMIT)
    const customDataSize = FeeQuoterSetup.MAX_DATA_SIZE
    expect(customDataSize).toBeGreaterThan(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD)

    for (const token of testTokens) {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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

      const result = await setup.getValidatedFee(message, beginCell().endCell())

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
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        calldataLen,
        BigInt(message.tokenAmounts.length),
        0n,
      )

      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price

      expect(result.fee).toEqual(totalPriceInFeeToken)
    }
  })

  it('should allow out of order execution when not enforced', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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

    const result = await setup.getValidatedFee(message, beginCell().endCell())
    expect(result.fee).toBeGreaterThan(0n)
  })

  // Error cases

  it('should allow fail when allow out of order execution is false', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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
      feeQuoter.FeeQuoterError.ExtraArgOutOfOrderExecutionMustBeTrue,
    )
  })

  it('should revert when destination chain not enabled', async () => {
    const invalidChainSelector = FeeQuoterSetup.DEST_CHAIN_SELECTOR + 1n
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
        msg: { msg: message, metadata: beginCell().endCell() },
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
      op: sendExec.Opcodes.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<sendExec.MessageValidationFailed>(
          x,
          sendExec.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.FeeQuoterError.DestChainNotEnabled)
              // return true
            },
          ],
        )
      },
    })
  })

  it('should revert when message too large', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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
        msg: { msg: message, metadata: beginCell().endCell() },
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
      op: sendExec.Opcodes.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<sendExec.MessageValidationFailed>(
          x,
          sendExec.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.FeeQuoterError.MsgDataTooLarge)
            },
          ],
        )
      },
    })
  })

  it('should revert when too many tokens', async () => {
    const tooManyTokens = [FeeQuoterSetup.SOURCE_FEE_TOKEN] // We don't support token transfers in TON yet

    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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
        msg: { msg: message, metadata: beginCell().endCell() },
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
      op: sendExec.Opcodes.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<sendExec.MessageValidationFailed>(
          x,
          sendExec.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.FeeQuoterError.UnsupportedNumberOfTokens)
            },
          ],
        )
      },
    })
  })

  it('should revert when gas limit too high', async () => {
    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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
        msg: { msg: message, metadata: beginCell().endCell() },
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
      op: sendExec.Opcodes.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<sendExec.MessageValidationFailed>(
          x,
          sendExec.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.FeeQuoterError.GasLimitTooHigh)
            },
          ],
        )
      },
    })
  })

  skip('should revert when fee token not supported', async () => {
    const notAFeeToken = FeeQuoterSetup.CUSTOM_TOKEN.token

    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
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
        msg: { msg: message, metadata: beginCell().endCell() },
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
      op: sendExec.Opcodes.messageValidationFailed,
      success: true,
      body(x) {
        return verifyBodyMessage<sendExec.MessageValidationFailed>(
          x,
          sendExec.builder.message.in.messageValidationFailed,
          [
            (msg) => {
              return msg.error === BigInt(feeQuoter.FeeQuoterError.FeeTokenNotSupported)
            },
          ],
        )
      },
    })
  })

  // Overflow/Underflow Edge Case Tests
  describe('Overflow and Underflow Edge Cases', () => {
    it('should handle extreme gas price that could cause overflow in coin serialization', async () => {
      // Set up extreme gas prices that approach uint112 maximum
      const extremeGasPrice = (1n << 112n) - 1n // Max uint112: ~5.2e33
      const extremeDAGasPrice = (1n << 112n) - 1n

      const tokenPricesUpdates: Token[] = [
        {
          token: FeeQuoterSetup.NATIVE_TON.token,
          price: 1n,
        },
      ]
      const priceUpdates: feeQuoter.PriceUpdates = {
        tokenPricesUpdates: tokenPricesUpdates,
        gasPricesUpdates: [
          {
            chainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
            executionGasPrice: extremeGasPrice,
            dataAvailabilityGasPrice: extremeDAGasPrice,
          },
        ],
      }

      const updateResult = await setup.bind.feeQuoter.sendUpdatePrices(
        setup.acc.owner.getSender(),
        {
          value: toNano('1'),
          msg: { updates: priceUpdates },
        },
      )
      expect(updateResult.transactions).toHaveTransaction({
        to: setup.bind.feeQuoter.address,
        success: true,
      })

      // Create message with maximum gas limit to maximize overflow potential
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: asSnakeBytes(Buffer.alloc(FeeQuoterSetup.MAX_DATA_SIZE)), // Max data size
        tokenAmounts: [],
        feeToken: FeeQuoterSetup.NATIVE_TON.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: BigInt(FeeQuoterSetup.MAX_GAS_LIMIT), // Max gas limit
            allowOutOfOrderExecution: true,
          })
          .endCell(),
      }
      // replace with sendGetValidatedFee to capture failure
      await setup.assertGetFeeValidationError(message, feeQuoter.FeeQuoterError.FeeOverflow)
    })
  })
})
