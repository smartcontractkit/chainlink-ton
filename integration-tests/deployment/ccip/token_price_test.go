package ccip

import (
	"math/big"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
)

func TestTokenPrice(t *testing.T) {
	tests := []struct {
		title         string
		usdPrice      string
		tokenDecimals int
		expected      string
	}{
		{
			title:         "eth decimals 18",
			usdPrice:      "1.23",
			tokenDecimals: 18,
			expected:      padZeros("123", 18-2),
		},
		{
			title:         "ton decimals 9",
			usdPrice:      "1.23",
			tokenDecimals: 9,
			expected:      padZeros("123", 27-2),
		},
		{
			title:         "zero decimals",
			usdPrice:      "1.23",
			tokenDecimals: 0,
			expected:      padZeros("123", 36-2),
		},
		{
			title:         "high precision price 18 decimals",
			usdPrice:      "1.123456789012345678",
			tokenDecimals: 18,
			expected:      "1123456789012345678",
		},
		{
			title:         "high precision price 18 decimals truncates correctly",
			usdPrice:      "1.1234567890123456789",
			tokenDecimals: 18,
			expected:      "1123456789012345678",
		},
		{
			title:         "high precision price 9 decimals truncates correctly",
			usdPrice:      "1.1234567890123456789",
			tokenDecimals: 9,
			expected:      padZeros("11234567890123456789", 8),
		},
		{
			title:         "previous TON value",
			usdPrice:      "2",
			tokenDecimals: 9,
			expected: func() string {
				const TONtoUSD = 2                 // Example Value
				const TONtoNanoTON = 1e9           // Smallest denomination
				const TokenPriceBaseAmount = 1e18  // Defined for `TokenPrices`
				var USDDecimals = big.NewInt(1e18) // Defined for `TokenPrices`
				var TONBaseAmountTokenPrice = big.NewInt(int64(TONtoUSD * (TokenPriceBaseAmount / TONtoNanoTON)))
				tonTokenPrice := big.NewInt(0).Mul(TONBaseAmountTokenPrice, USDDecimals)
				return tonTokenPrice.String()
			}(),
		},
	}
	for _, tt := range tests {
		t.Run(tt.usdPrice, func(t *testing.T) {
			price, err := config.CCIPTokenPrice(tt.usdPrice, tt.tokenDecimals)
			if err != nil {
				t.Fatalf("TokenPrice() error = %v", err)
			}
			require.Equalf(t, tt.expected, price.String(), tt.title)
		})
	}
}

func padZeros(val string, zeros int) string {
	valInt, ok := new(big.Int).SetString(val+strings.Repeat("0", zeros), 10)
	if !ok {
		panic("Could not convert to bigint")
	}
	return valInt.String()
}
