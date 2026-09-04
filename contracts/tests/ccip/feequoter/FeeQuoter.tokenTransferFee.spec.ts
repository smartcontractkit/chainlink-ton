import '@ton/test-utils'

import { Address, Cell, toNano } from '@ton/core'

import { FeeQuoterSetup, FeeQuoterFeeSetup } from './FeeQuoterSetup'
import * as feeQuoter from '../../../wrappers/gen/ccip/FeeQuoter'
import * as rt from '../../../wrappers/gen/ccip/Router'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'
import { ChainSelectors } from '../../utils/Selectors'

// This suite verifies the token-transfer fee math introduced in FeeQuoter.calculateValidatedFee:
// the per-(destChain, token) TokenTransferFeeConfig override (deciBps of transferred value,
// clamped to [minFeeUsdCents, maxFeeUsdCents]), its fallback to the dest chain's flat
// defaultTokenFeeUsdCents/defaultTokenDestGasOverhead when no override exists or it is disabled,
// and how the resulting premium/gas/bytes-overhead feed into the overall fee (execution gas,
// data-availability cost, and the USD premium).
//
// Test scenarios and numeric structure are cross-checked against the equivalent EVM
// (`FeeQuoter.getTokenTransferCost.t.sol`: per-token override, disabled-config-uses-defaults,
// explicit-zero-fee-is-still-charged) and Solana (`programs/fee-quoter/.../public.rs` tests:
// `network_fee_for_a_supported_token_with_bps`, `..._with_disabled_billing`,
// `..._with_no_fee_token_config`, `network_fee_for_multiple_tokens`) FeeQuoter test suites.
describe('FeeQuoter Token Transfer Fee', () => {
  let setup: FeeQuoterFeeSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })

  beforeEach(async () => {
    setup = new FeeQuoterFeeSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('tokenTransferFee', blockchain)
  })

  const DEST_CHAIN = ChainSelectors.testnet.evm
  const VAL_1E5 = 100000n
  const VAL_1E16 = 10000000000000000n
  const VAL_1E18 = 1000000000000000000n

  function usdCentsToWei(cents: bigint): bigint {
    return cents * VAL_1E16
  }

  type TokenFeeConfig = {
    isEnabled: boolean
    minFeeUsdCents: bigint
    maxFeeUsdCents: bigint
    deciBps: bigint
    destGasOverhead: bigint
    destBytesOverhead: bigint
  }

  // Mirrors `_tokenTransferFee` in fee_quoter/contract.tolk exactly (same operation order,
  // same integer division), so any amount/config combination reproduces the on-chain result.
  function computeTokenTransferFee(
    config: TokenFeeConfig | undefined,
    tokenPrice: bigint | undefined,
    amount: bigint,
  ): { premiumFeeUsdWei: bigint; gas: bigint; bytesOverhead: bigint } {
    if (config && config.isEnabled) {
      let premium = 0n
      if (config.deciBps > 0n && tokenPrice !== undefined && tokenPrice > 0n) {
        const tokenValueUsdWei = (amount * tokenPrice) / VAL_1E18
        premium = (tokenValueUsdWei * config.deciBps) / VAL_1E5
      }
      const min = usdCentsToWei(config.minFeeUsdCents)
      const max = usdCentsToWei(config.maxFeeUsdCents)
      if (premium < min) premium = min
      else if (premium > max) premium = max
      return { premiumFeeUsdWei: premium, gas: config.destGasOverhead, bytesOverhead: config.destBytesOverhead }
    }
    return {
      premiumFeeUsdWei: usdCentsToWei(FeeQuoterSetup.DEFAULT_TOKEN_FEE_USD_CENTS),
      gas: FeeQuoterSetup.DEFAULT_TOKEN_DEST_GAS_OVERHEAD,
      bytesOverhead: FeeQuoterSetup.DEFAULT_TOKEN_BYTES_OVERHEAD,
    }
  }

  type TokenLeg = {
    token: Address
    amount: bigint
    config?: TokenFeeConfig
    price?: bigint
  }

  // Mirrors the rest of `calculateValidatedFee`: sums the per-token results, folds them into
  // execution gas / calldata gas, and combines with the on-chain data-availability cost getter
  // (which itself encodes the DA byte-length formula) to get the final fee-token amount.
  async function expectedFee(tokens: TokenLeg[], feeTokenAddr: Address, feeTokenPrice: bigint) {
    let totalPremium = 0n
    let totalGas = 0n
    let totalBytesOverhead = 0n
    for (const t of tokens) {
      const { premiumFeeUsdWei, gas, bytesOverhead } = computeTokenTransferFee(t.config, t.price, t.amount)
      totalPremium += premiumFeeUsdWei
      totalGas += gas
      totalBytesOverhead += bytesOverhead
    }

    const msgDataLen = 0n
    const calldataLen = msgDataLen + totalBytesOverhead
    const threshold = FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD
    const calldataGas =
      calldataLen > threshold
        ? (calldataLen - threshold) * FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_HIGH +
          threshold * FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE
        : calldataLen * FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE

    const gasUsed = FeeQuoterSetup.GAS_LIMIT + FeeQuoterSetup.DEST_GAS_OVERHEAD + totalGas + calldataGas
    const gasFeeUSD = gasUsed * FeeQuoterSetup.destChainConfig.gasMultiplierWeiPerEth * FeeQuoterSetup.USD_PER_GAS

    const premiumMultiplierWeiPerEth = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(feeTokenAddr)
    const messageFeeUSD = totalPremium * premiumMultiplierWeiPerEth

    const dataAvailabilityFeeUSD = await setup.bind.feeQuoter.getDataAvailabilityCost(
      DEST_CHAIN,
      FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
      msgDataLen,
      BigInt(tokens.length),
      totalBytesOverhead,
    )

    return (gasFeeUSD + messageFeeUSD + dataAvailabilityFeeUSD) / feeTokenPrice
  }

  function messageWithTokens(tokens: TokenLeg[], feeToken: Address): rt.Router_CCIPSend {
    return rt.Router_CCIPSend.create({
      destChainSelector: DEST_CHAIN,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: tokens.map((t) => rt.TokenAmount.create({ token: t.token, amount: t.amount })),
      feeToken,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: FeeQuoterSetup.GAS_LIMIT,
        allowOutOfOrderExecution: true,
      }),
    })
  }

  const FEE_TOKEN = FeeQuoterSetup.NATIVE_TON

  it('applies the per-token override fee proportionally (unclamped deciBps)', async () => {
    const token = FeeQuoterSetup.SOURCE_FEE_TOKEN
    const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, token.token)
    // Large enough that the deciBps-derived premium lands strictly within [minFeeUsdCents, maxFeeUsdCents].
    const amount = 10_000n * VAL_1E18

    const message = messageWithTokens([{ token: token.token, amount, config, price: token.price }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)

    const expected = await expectedFee(
      [{ token: token.token, amount, config, price: token.price }],
      FEE_TOKEN.token,
      FEE_TOKEN.price,
    )
    expect(result.fee.feeTokenAmount).toEqual(expected)

    // Sanity: for this amount, the bps-derived premium is not at either clamp boundary.
    const { premiumFeeUsdWei } = computeTokenTransferFee(config, token.price, amount)
    expect(premiumFeeUsdWei).toBeGreaterThan(usdCentsToWei(config.minFeeUsdCents))
    expect(premiumFeeUsdWei).toBeLessThan(usdCentsToWei(config.maxFeeUsdCents))
  })

  it('clamps the token transfer fee to the configured minimum for small transfers', async () => {
    const token = FeeQuoterSetup.SOURCE_FEE_TOKEN
    const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, token.token)
    const amount = 1n * VAL_1E18 // 1 token: bps-derived premium falls below minFeeUsdCents

    const { premiumFeeUsdWei } = computeTokenTransferFee(config, token.price, amount)
    expect(premiumFeeUsdWei).toEqual(usdCentsToWei(config.minFeeUsdCents))

    const message = messageWithTokens([{ token: token.token, amount }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)
    const expected = await expectedFee(
      [{ token: token.token, amount, config, price: token.price }],
      FEE_TOKEN.token,
      FEE_TOKEN.price,
    )
    expect(result.fee.feeTokenAmount).toEqual(expected)
  })

  it('clamps the token transfer fee to the configured maximum for large transfers', async () => {
    const token = FeeQuoterSetup.SOURCE_FEE_TOKEN
    const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, token.token)
    const amount = 1_000_000n * VAL_1E18 // large transfer: bps-derived premium exceeds maxFeeUsdCents

    const { premiumFeeUsdWei } = computeTokenTransferFee(config, token.price, amount)
    expect(premiumFeeUsdWei).toEqual(usdCentsToWei(config.maxFeeUsdCents))

    const message = messageWithTokens([{ token: token.token, amount }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)
    const expected = await expectedFee(
      [{ token: token.token, amount, config, price: token.price }],
      FEE_TOKEN.token,
      FEE_TOKEN.price,
    )
    expect(result.fee.feeTokenAmount).toEqual(expected)
  })

  it('falls back to the dest chain defaults when the per-token override is disabled', async () => {
    const token = FeeQuoterSetup.CUSTOM_TOKEN_2 // configured with isEnabled: false
    const config = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, token.token)
    expect(config.isEnabled).toBe(false)
    const amount = 10_000n * VAL_1E18

    const message = messageWithTokens([{ token: token.token, amount }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)

    const expected = await expectedFee([{ token: token.token, amount }], FEE_TOKEN.token, FEE_TOKEN.price)
    expect(result.fee.feeTokenAmount).toEqual(expected)

    // The disabled override's own numbers must not leak into the result.
    const { premiumFeeUsdWei, gas, bytesOverhead } = computeTokenTransferFee(undefined, undefined, amount)
    expect(premiumFeeUsdWei).toEqual(usdCentsToWei(FeeQuoterSetup.DEFAULT_TOKEN_FEE_USD_CENTS))
    expect(gas).toEqual(FeeQuoterSetup.DEFAULT_TOKEN_DEST_GAS_OVERHEAD)
    expect(bytesOverhead).toEqual(FeeQuoterSetup.DEFAULT_TOKEN_BYTES_OVERHEAD)
  })

  it('falls back to the dest chain defaults when no per-token override exists at all', async () => {
    const token = FeeQuoterSetup.DEST_LINK // priced, but has no TokenTransferFeeConfig on this dest chain
    await expect(setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, token.token)).rejects.toThrow()

    const amount = 10_000n * VAL_1E18
    const message = messageWithTokens([{ token: token.token, amount }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)

    const expected = await expectedFee([{ token: token.token, amount }], FEE_TOKEN.token, FEE_TOKEN.price)
    expect(result.fee.feeTokenAmount).toEqual(expected)
  })

  it('treats a zero-deciBps override as a flat fee, independent of amount and without needing a token price', async () => {
    // A fresh token with no usdPerToken entry at all: proves the deciBps==0 branch never looks
    // up a price (matches EVM's flat, amount-independent token-transfer fee model).
    const token = Address.parse(`0:${Buffer.from('ZERO_BPS_TOKEN').toString('hex').padStart(64, '0')}`)
    const config = feeQuoter.TokenTransferFeeConfig.create({
      isEnabled: true,
      minFeeUsdCents: 300n,
      maxFeeUsdCents: 900n,
      deciBps: 0n,
      destGasOverhead: 42_000n,
      destBytesOverhead: 64n,
    })

    const configResult = await setup.bind.feeQuoter.sendFeeQuoterUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      toNano('1'),
      {
        updates: new Map([
          [DEST_CHAIN, feeQuoter.UpdateTokenTransferFeeConfig.create({ add: new Map([[token, config]]), remove: [] })],
        ]),
      },
    )
    expect(configResult.transactions).toHaveTransaction({ to: setup.bind.feeQuoter.address, success: true })

    for (const amount of [1n, 1_000_000n * VAL_1E18]) {
      const message = messageWithTokens([{ token, amount }], FEE_TOKEN.token)
      const result = await setup.getValidatedFee(message)
      const expected = await expectedFee([{ token, amount, config }], FEE_TOKEN.token, FEE_TOKEN.price)
      expect(result.fee.feeTokenAmount).toEqual(expected)

      const { premiumFeeUsdWei } = computeTokenTransferFee(config, undefined, amount)
      expect(premiumFeeUsdWei).toEqual(usdCentsToWei(config.minFeeUsdCents))
    }
  })

  it('treats a missing token price as a zero bps component (does not revert), still clamped to the configured min', async () => {
    // Config is enabled with deciBps > 0, but the transferred token has no usdPerToken entry.
    // Matches Solana's graceful-degradation behavior (network_fee_for_a_supported_token_with_no_fee_token_config):
    // the bps-derived component is treated as 0 rather than reverting, and the result still goes
    // through the min/max clamp.
    const token = Address.parse(`0:${Buffer.from('NO_PRICE_TOKEN').toString('hex').padStart(64, '0')}`)
    const config = feeQuoter.TokenTransferFeeConfig.create({
      isEnabled: true,
      minFeeUsdCents: 150n,
      maxFeeUsdCents: 999_999n,
      deciBps: 5_000n,
      destGasOverhead: 10_000n,
      destBytesOverhead: 32n,
    })

    const configResult = await setup.bind.feeQuoter.sendFeeQuoterUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      toNano('1'),
      {
        updates: new Map([
          [DEST_CHAIN, feeQuoter.UpdateTokenTransferFeeConfig.create({ add: new Map([[token, config]]), remove: [] })],
        ]),
      },
    )
    expect(configResult.transactions).toHaveTransaction({ to: setup.bind.feeQuoter.address, success: true })

    const amount = 15_000_000_000_000_000n
    const message = messageWithTokens([{ token, amount }], FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)

    const expected = await expectedFee([{ token, amount, config }], FEE_TOKEN.token, FEE_TOKEN.price)
    expect(result.fee.feeTokenAmount).toEqual(expected)

    const { premiumFeeUsdWei } = computeTokenTransferFee(config, undefined, amount)
    expect(premiumFeeUsdWei).toEqual(usdCentsToWei(config.minFeeUsdCents))

    // Changing deciBps has no effect while the price remains unknown.
    const configWithHigherBps = { ...config, deciBps: 20_000n }
    const { premiumFeeUsdWei: premiumWithHigherBps } = computeTokenTransferFee(configWithHigherBps, undefined, amount)
    expect(premiumWithHigherBps).toEqual(premiumFeeUsdWei)
  })

  it('sums the premium, dest gas overhead and dest bytes overhead across multiple tokens', async () => {
    const tokenA = FeeQuoterSetup.SOURCE_FEE_TOKEN
    const tokenB = FeeQuoterSetup.CUSTOM_TOKEN
    const configA = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, tokenA.token)
    const configB = await setup.bind.feeQuoter.getTokenTransferFeeConfig(DEST_CHAIN, tokenB.token)
    const amountA = 10_000n * VAL_1E18
    const amountB = 100_000n * VAL_1E18

    const legs: TokenLeg[] = [
      { token: tokenA.token, amount: amountA, config: configA, price: tokenA.price },
      { token: tokenB.token, amount: amountB, config: configB, price: tokenB.price },
    ]

    const message = messageWithTokens(legs, FEE_TOKEN.token)
    const result = await setup.getValidatedFee(message)
    const expected = await expectedFee(legs, FEE_TOKEN.token, FEE_TOKEN.price)
    expect(result.fee.feeTokenAmount).toEqual(expected)

    // The combined fee must exceed either token's fee taken alone (premium/gas/bytes all sum).
    const soloA = await expectedFee([legs[0]], FEE_TOKEN.token, FEE_TOKEN.price)
    const soloB = await expectedFee([legs[1]], FEE_TOKEN.token, FEE_TOKEN.price)
    expect(result.fee.feeTokenAmount).toBeGreaterThan(soloA)
    expect(result.fee.feeTokenAmount).toBeGreaterThan(soloB)
  })

  it('reverts with UnsupportedNumberOfTokens when the message exceeds maxNumberOfTokensPerMsg', async () => {
    const destChainConfig = await setup.bind.feeQuoter.getDestChainConfig(DEST_CHAIN)
    const maxTokens = destChainConfig.config.maxNumberOfTokensPerMsg
    expect(maxTokens).toEqual(FeeQuoterSetup.MAX_TOKENS_LENGTH)

    const tooManyTokens: TokenLeg[] = Array.from({ length: Number(maxTokens) + 1 }, (_, i) => ({
      token:
        i % 2 === 0
          ? FeeQuoterSetup.SOURCE_FEE_TOKEN.token
          : FeeQuoterSetup.CUSTOM_TOKEN.token,
      amount: toNano('100'),
    }))

    const message = messageWithTokens(tooManyTokens, FEE_TOKEN.token)
    await setup.assertGetFeeValidationError(
      message,
      feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnsupportedNumberOfTokens'],
    )
  })

  it('reverts with PremiumFeeOverflow instead of wrapping when the token value overflows', async () => {
    const token = Address.parse(`0:${Buffer.from('OVERFLOW_TOKEN').toString('hex').padStart(64, '0')}`)
    const config = feeQuoter.TokenTransferFeeConfig.create({
      isEnabled: true,
      minFeeUsdCents: 1n,
      maxFeeUsdCents: 999_999_999n,
      deciBps: 10_000n,
      destGasOverhead: 1n,
      destBytesOverhead: 32n,
    })

    const configResult = await setup.bind.feeQuoter.sendFeeQuoterUpdateTokenTransferFeeConfigs(
      setup.acc.owner.getSender(),
      toNano('1'),
      {
        updates: new Map([
          [DEST_CHAIN, feeQuoter.UpdateTokenTransferFeeConfig.create({ add: new Map([[token, config]]), remove: [] })],
        ]),
      },
    )
    expect(configResult.transactions).toHaveTransaction({ to: setup.bind.feeQuoter.address, success: true })

    // Close to uint224 max, so amount * price overflows a 257-bit signed int.
    const hugePrice = 1n << 223n
    const priceResult = await setup.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      setup.acc.owner.getSender(),
      toNano('1'),
      {
        updates: feeQuoter.PriceUpdates.create({
          tokenPriceUpdates: [feeQuoter.TokenPriceUpdate.create({ sourceToken: token, usdPerToken: hugePrice })],
          gasPriceUpdates: [],
        }),
        sendExcessesTo: setup.acc.owner.address,
      },
    )
    expect(priceResult.transactions).toHaveTransaction({ to: setup.bind.feeQuoter.address, success: true })

    // Close to the coins max (2^120 - 1).
    const hugeAmount = 1n << 119n
    const message = messageWithTokens([{ token, amount: hugeAmount }], FEE_TOKEN.token)

    await setup.assertGetFeeValidationError(
      message,
      feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.PremiumFeeOverflow'],
    )
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_token_transfer_fee_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
