import '@ton/test-utils'

import { toNano, Address, Cell, beginCell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { FeeQuoterSetup, FeeQuoterFeeSetup } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'
import * as rt from '../../../wrappers/ccip/Router'
import { asSnakeBytes, asSnakeData, ZERO_ADDRESS } from '../../../src/utils'
import { skip } from 'node:test'

describe('FeeQuoter GetValidatedFee', () => {
  let setup: FeeQuoterFeeSetup

  beforeEach(async () => {
    setup = new FeeQuoterFeeSetup()
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('getValidatedFee')
  })

  it('should calculate fee for empty message', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS // Native TON and Linkq
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
    // TODO test_getValidatedFee_ZeroDataAvailabilityMultiplier
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
            allowOutOfOrderExecution: false,
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

  it('should calculate fee for single token transfer', async () => {
    const tokenAmount = toNano(10000e18)
    for (const token of FeeQuoterSetup.SOURCE_FEE_TOKENS) {
      // Message with s_sourceFeeToken being transferred, paying fee with token
      const message = setup.generateSingleTokenMessage({
        token: FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
        amount: tokenAmount,
        feeToken: token.token,
      })

      const tokenTransferFeeConfig = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        message.tokenAmounts[0].token,
      )
      const destBytesOverhead = tokenTransferFeeConfig.destBytesOverhead

      expect(destBytesOverhead).toBeGreaterThan(0n) // as FeeQuoterSetup.CCIP_LOCK_OR_BURN_V1_RET_BYTES is not available
      const tokenBytesOverhead = destBytesOverhead

      const feeAmount = (await setup.getValidatedFee(message, beginCell().endCell())).fee

      // Calculate expected fee
      const gasUsed =
        BigInt(FeeQuoterSetup.GAS_LIMIT) +
        BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD) +
        BigInt(tokenBytesOverhead) * BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE) +
        BigInt(tokenTransferFeeConfig.destGasOverhead)

      const gasFeeUSD =
        gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS

      const { transferFeeUSD } = await setup.bind.feeQuoter.getTokenTransferCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        message.tokenAmounts,
      )
      const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        message.feeToken,
      )
      const messageFeeUSD = transferFeeUSD * premiumMultiplierWeiPerEth

      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        0n, // message.data is empty
        BigInt(message.tokenAmounts.length),
        BigInt(tokenBytesOverhead),
      )

      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price

      expect(feeAmount).toEqual(totalPriceInFeeToken)
    }
  })

  it('should calculate fee for message with data and token transfer', async () => {
    const testTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS

    const customGasLimit = BigInt(1_000_000)
    const testData = 'random bits and bytes that should be factored into the cost of the message'

    for (const token of testTokens) {
      const message: rt.CCIPSend = {
        destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        receiver: FeeQuoterSetup.DEST_ADDRESS,
        data: asSnakeBytes(Buffer.from(testData)),
        tokenAmounts: [
          { token: FeeQuoterSetup.SOURCE_FEE_TOKEN.token, amount: toNano(10000e18) }, // feeTokenAmount
          { token: FeeQuoterSetup.CUSTOM_TOKEN.token, amount: toNano(200000e18) }, // customTokenAmount
        ],
        feeToken: token.token,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: customGasLimit,
            allowOutOfOrderExecution: false,
          })
          .endCell(),
      }

      const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(
        message.feeToken,
      )

      // Calculate token gas and bytes overhead
      let tokenGasOverhead = 0n
      let tokenBytesOverhead = 0n
      for (const tokenAmount of message.tokenAmounts) {
        const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(
          FeeQuoterSetup.DEST_CHAIN_SELECTOR,
          tokenAmount.token,
        )
        tokenGasOverhead += BigInt(config.destGasOverhead)
        expect(config.destBytesOverhead).toBeGreaterThan(0n) // as FeeQuoterSetup.CCIP_LOCK_OR_BURN_V1_RET_BYTES is not available
        tokenBytesOverhead += BigInt(config.destBytesOverhead)
      }
      const { transferFeeUSD, tokenTransferBytesOverhead } =
        await setup.bind.feeQuoter.getTokenTransferCost(
          FeeQuoterSetup.DEST_CHAIN_SELECTOR,
          message.tokenAmounts,
        )
      // Calculate gas fee
      const dataLength = BigInt(testData.length)
      const gasFeeUSD = (() => {
        const gasUsed =
          customGasLimit +
          BigInt(FeeQuoterSetup.DEST_GAS_OVERHEAD) +
          (dataLength + BigInt(tokenTransferBytesOverhead)) *
            BigInt(FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE) +
          tokenGasOverhead

        return (
          gasUsed *
          FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth *
          FeeQuoterSetup.USD_PER_GAS
        )
      })()

      const messageFeeUSD = transferFeeUSD * premiumMultiplierWeiPerEth

      const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
        FeeQuoterSetup.DEST_CHAIN_SELECTOR,
        FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        dataLength,
        BigInt(message.tokenAmounts.length),
        tokenBytesOverhead,
      )
      const totalPriceInFeeToken =
        (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / token.price
      console.log('token.price', token.price)
      const result = await setup.getValidatedFee(message, beginCell().endCell())
      console.log('diff', result.fee - totalPriceInFeeToken)
      console.log(
        'diff without token price',
        result.fee * token.price - totalPriceInFeeToken * token.price,
      )
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

    // Should fail - destination chain not configured
    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
      // exitCode: feeQuoter.FeeQuoterError.DestChainNotEnabled,
      exitCode: 7, // TODO Tolk mustGet doesn't support big values yet
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

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
      exitCode: feeQuoter.FeeQuoterError.MsgDataTooLarge,
    })
  })

  it('should revert when too many tokens', async () => {
    const tooManyTokens = Array(FeeQuoterSetup.MAX_TOKENS_LENGTH + 1)
      .fill(null)
      .map(() => ({
        token: FeeQuoterSetup.SOURCE_FEE_TOKENS[1].token,
        amount: toNano('100'),
      }))

    const message: rt.CCIPSend = {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: beginCell().endCell(),
      tokenAmounts: tooManyTokens,
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

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
      exitCode: feeQuoter.FeeQuoterError.UnsupportedNumberOfTokens,
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

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
      exitCode: feeQuoter.FeeQuoterError.GasLimitTooHigh,
    })
  })

  it('should revert when fee token not supported', async () => {
    const notAFeeToken = Address.parse(
      '0:1111111111111111111111111111111111111111111111111111111111111111',
    )

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

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
      // exitCode: feeQuoter.FeeQuoterError.FeeTokenNotSupported,
      exitCode: 7, // TODO Tolk mustGet doesn't support big values yet
    })
  })
})
