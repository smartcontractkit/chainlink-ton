import Decimal from 'decimal.js'

export const TOKEN_PRICE_BASE_AMOUNT_EXPONENTIAL = 18 // Defined for `TokenPrices`
export const TOKEN_PRICE_DECIMALS = 18 // Defined for `TokenPrices`

/**
 * Converts a USD price to 1e18 units of the smallest denomination of the
 * Token. The output is a bigint representation of the decimal value, scaled to
 * preserve 18 decimals of precision.
 *
 * E.g., for a token with 9 decimals (like TON), 1 TON = 1e9 Nano (smallest
 * denomination). The price unit would be 1e18 Nano, which is 1e9 TON.
 * As of September 2025, if the token price is around $3.15, then the price is
 * calculated as 3.15e9 USD.
 *
 * The returned integer would be: `3.15 * 1e27 (3.15e9 * 1e18)`
 *
 * @param priceInUSD - The price in USD of the token unit.
 * @param decimalCount - The number of decimals the token uses.
 * @returns The price represented as a bigint with 18 decimals.
 */
export function usdPriceToTokenPrice(priceInUSD: string, decimalCount: number): bigint {
  // We use string representation of the value and `decimal.js` to avoid floating point precision issues.
  const decimalPrice = new Decimal(priceInUSD)
  decimalPrice.mul(
    new Decimal(10).pow(TOKEN_PRICE_BASE_AMOUNT_EXPONENTIAL + TOKEN_PRICE_DECIMALS - decimalCount),
  )
  return BigInt(decimalPrice.toFixed(0))
}

/**
 * # _== DISCLAIMER ==_
 *
 * **This prices are for testing purposes only and may not reflect the current market value.**
 */
export const TESTING_VALUES = (() => {
  const usdPrice = {
    ton: '2.12',
    eth: '3913.22',
    link: '18.21',
  }
  const decimalCount = {
    ton: 9,
    eth: 18,
    link: 18,
  }
  return {
    usdPrice,
    decimalCount,
    tokenPrice: {
      ton: usdPriceToTokenPrice(usdPrice.ton, decimalCount.ton),
      eth: usdPriceToTokenPrice(usdPrice.eth, decimalCount.eth),
      link: usdPriceToTokenPrice(usdPrice.link, decimalCount.link),
    },
  }
})()
