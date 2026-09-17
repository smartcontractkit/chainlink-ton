package config

import (
	"math/big"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// padZeros appends `zeros` trailing zeros to val and returns the canonical
// big.Int string representation (no leading zeros).
func padZeros(val string, zeros int) string {
	v, ok := new(big.Int).SetString(val+strings.Repeat("0", zeros), 10)
	if !ok {
		panic("padZeros: failed to convert to big.Int")
	}
	return v.String()
}

func TestCCIPTokenPrice(t *testing.T) {
	tests := []struct {
		name          string
		usdPrice      string
		tokenDecimals int
		expected      string
	}{
		// --- basic decimal alignment ---
		{
			name:          "eth 18 decimals at 1.23 USD",
			usdPrice:      "1.23",
			tokenDecimals: 18,
			expected:      padZeros("123", -2+18),
		},
		{
			name:          "ton 9 decimals at 1.23 USD",
			usdPrice:      "1.23",
			tokenDecimals: 9,
			expected:      padZeros("123", -2+18+9),
		},
		{
			name:          "zero decimals at 1.23 USD",
			usdPrice:      "1.23",
			tokenDecimals: 0,
			expected:      padZeros("123", -2+18+18),
		},
		// --- integer prices ---
		{
			name:          "integer price 2 USD with 9 decimals (TON)",
			usdPrice:      "2",
			tokenDecimals: 9,
			expected:      padZeros("2", -0+18+9),
		},
		{
			name:          "integer price 20 USD with 9 decimals (LINK on TON)",
			usdPrice:      "20",
			tokenDecimals: 9,
			expected:      padZeros("20", -0+18+9),
		},
		{
			name:          "integer price 10 USD with 18 decimals",
			usdPrice:      "10",
			tokenDecimals: 18,
			expected:      padZeros("10", -0+18),
		},
		// --- zero price ---
		{
			name:          "zero price",
			usdPrice:      "0",
			tokenDecimals: 18,
			expected:      "0",
		},
		{
			name:          "zero price zero decimals",
			usdPrice:      "0",
			tokenDecimals: 0,
			expected:      "0",
		},
		// --- high precision / truncation (big.Int.Div truncates toward zero) ---
		{
			name:          "high precision 18 decimals exact",
			usdPrice:      "1.123456789012345678",
			tokenDecimals: 18,
			expected:      "1123456789012345678",
		},
		{
			name:          "high precision 18 decimals truncates extra digit",
			usdPrice:      "1.1234567890123456789",
			tokenDecimals: 18,
			expected:      "1123456789012345678", // trailing 9 is truncated
		},
		{
			name:          "high precision 9 decimals truncates correctly",
			usdPrice:      "1.1234567890123456789",
			tokenDecimals: 9,
			expected:      padZeros("11234567890123456789", 8),
		},
		// --- very small prices ---
		{
			name:          "sub-cent price 18 decimals",
			usdPrice:      "0.000000000000000001",
			tokenDecimals: 18,
			expected:      "1", // 1e-18 * 1e18 = 1
		},
		{
			name:          "sub-cent price 9 decimals",
			usdPrice:      "0.0000000000000000001",
			tokenDecimals: 9,
			expected:      "100000000", // 1e-19 * 1e27 = 1e8
		},
		{
			name:          "sub-cent price 9 decimals truncates to zero",
			usdPrice:      "0.0000000000000000000000000001",
			tokenDecimals: 9,
			expected:      "0", // 1e-28 * 1e27 = 0.1, truncates to 0
		},
		// --- large prices ---
		{
			name:          "large price 18 decimals",
			usdPrice:      "1000000",
			tokenDecimals: 18,
			expected:      padZeros("1000000", 18), // 1e6 * 1e18 = 1e24
		},
		{
			name:          "large price 6 decimals (USDC-like)",
			usdPrice:      "1.00",
			tokenDecimals: 6,
			expected:      padZeros("100", 28), // 1.00 * 1e30
		},
		// --- fractional large price ---
		{
			name:          "fractional price 6 decimals",
			usdPrice:      "0.99",
			tokenDecimals: 6,
			expected:      padZeros("99", 28), // 0.99 * 1e30
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			price, err := CCIPTokenPrice(tt.usdPrice, tt.tokenDecimals)
			require.NoError(t, err)
			require.Equal(t, tt.expected, price.String())
		})
	}
}

func TestCCIPTokenPrice_Errors(t *testing.T) {
	tests := []struct {
		name     string
		usdPrice string
	}{
		{name: "empty string", usdPrice: ""},
		{name: "non-numeric", usdPrice: "abc"},
		{name: "not a number", usdPrice: "1.2.3"},
		{name: "just a dot", usdPrice: "."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := CCIPTokenPrice(tt.usdPrice, 18)
			require.Error(t, err)
			require.Contains(t, err.Error(), "failed to parse string")
		})
	}
}
