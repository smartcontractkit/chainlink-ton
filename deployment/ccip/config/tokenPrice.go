package config

import (
	"fmt"
	"math/big"
)

// CCIPTokenPrice formats the token price from USD string to big.Int representation used in CCIP FeeQuoter
// That is the price of 1e18 units of the token's smallest denomination in USD with 18 decimals
func CCIPTokenPrice(usdPrice string, tokenDecimals int) (*big.Int, error) {
	const TokenPriceBaseAmountDigits = 18 // Defined for `TokenPrices`
	tokenPriceBaseAmount := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(TokenPriceBaseAmountDigits)), nil)
	var USDDecimals = 18 // Defined for `TokenPrices`
	usdDecimalsFactor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(USDDecimals)), nil)
	tokenDecimalsFactor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDecimals)), nil)

	usdPriceRational, ok := new(big.Rat).SetString(usdPrice)
	if !ok {
		return nil, fmt.Errorf("failed to parse string %s to big.Rat", usdPrice)
	}
	acc := usdPriceRational.Mul(usdPriceRational, new(big.Rat).SetInt(tokenPriceBaseAmount))

	acc = acc.Mul(acc, new(big.Rat).SetInt(usdDecimalsFactor))
	acc = acc.Mul(acc, new(big.Rat).Inv(new(big.Rat).SetInt(tokenDecimalsFactor)))
	// Convert to big.Int
	num := acc.Num()
	denom := acc.Denom()
	accInt := new(big.Int).Div(num, denom)
	return accInt, nil
}
