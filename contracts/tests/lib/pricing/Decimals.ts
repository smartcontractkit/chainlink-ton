export const TOKEN_PRICE_BASE_AMOUNT_EXPONENTIAL = 18 // Defined for `TokenPrices`
export const TOKEN_PRICE_DECIMALS = 18 // Defined for `TokenPrices`

/**
 * Gets the number of decimal places in a number
 * @param num - The number to check
 * @returns The number of decimal places
 */
function getDecimalPlaces(num: number): number {
  if (Math.floor(num) === num) return 0
  const str = num.toString()
  if (str.indexOf('.') !== -1 && str.indexOf('e-') === -1) {
    return str.split('.')[1].length
  } else if (str.indexOf('e-') !== -1) {
    const parts = str.split('e-')
    return parseInt(parts[1], 10)
  }
  return 0
}

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
export function usdPriceToTokenPrice(priceInUSD: number, decimalCount: number): bigint {
  // Get the number of decimal places in the price to avoid rounding errors
  const priceDecimals = getDecimalPlaces(priceInUSD)

  // Convert price to bigint by multiplying by 10^priceDecimals
  const scaledPrice = BigInt(Math.round(priceInUSD * Math.pow(10, priceDecimals)))

  // Calculate the scaling factor: 10^(TOKEN_PRICE_BASE_AMOUNT_EXPONENTIAL + TOKEN_PRICE_DECIMALS - decimalCount - priceDecimals)
  const scalingExponent =
    TOKEN_PRICE_BASE_AMOUNT_EXPONENTIAL + TOKEN_PRICE_DECIMALS - decimalCount - priceDecimals
  const scalingFactor = BigInt(10) ** BigInt(scalingExponent)

  return scaledPrice * scalingFactor
}

/**
 * # _== DISCLAIMER ==_
 *
 * **This prices are for testing purposes only and may not reflect the current market value.**
 */
export const TESTING_VALUES = (() => {
  const usdPrice = {
    ton: 2.12,
    eth: 3913.22,
    link: 18.21,
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
