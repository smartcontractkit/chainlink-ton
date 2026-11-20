package counter

import (
	"math"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

func TestSetCount_TlbEncodingDecoding(t *testing.T) {
	original := SetCount{
		QueryID:  123456789,
		NewCount: 42,
	}

	// Encode to cell
	c, err := tlb.ToCell(original)
	require.NoError(t, err, "tlb.ToCell encoding failed")
	require.Equal(t, "128[0000000400000000075BCD150000002A]", c.Dump())

	// Decode from cell
	var decoded SetCount
	err = tlb.Parse(&decoded, c)
	require.NoError(t, err, "tlb.LoadFromCell decoding failed")

	require.Equal(t, original.QueryID, decoded.QueryID, "QueryID mismatch after decoding")
	require.Equal(t, original.NewCount, decoded.NewCount, "NewCount mismatch after decoding")
}

func TestIncreaseCount_TlbEncodingDecoding(t *testing.T) {
	original := IncreaseCount{
		QueryID: 123456789,
	}

	// Encode to cell
	c, err := tlb.ToCell(original)
	require.NoError(t, err, "tlb.ToCell encoding failed")
	require.Equal(t, "96[1000000500000000075BCD15]", c.Dump())

	// Decode from cell
	var decoded IncreaseCount
	err = tlb.Parse(&decoded, c)
	require.NoError(t, err, "tlb.LoadFromCell decoding failed")

	require.Equal(t, original.QueryID, decoded.QueryID, "QueryID mismatch after decoding")
}

func TestGetters_DecodeUint32(t *testing.T) {
	for _, getter := range []struct {
		name string
		dec  func(*ton.ExecutionResult) (uint32, error)
	}{
		{"value", GetValue.Decoder.Decode},
		{"id", GetID.Decoder.Decode},
	} {
		t.Run(getter.name, func(t *testing.T) {
			got, err := getter.dec(ton.NewExecutionResult([]any{big.NewInt(42)}))
			require.NoError(t, err)
			require.Equal(t, uint32(42), got)

			got, err = getter.dec(ton.NewExecutionResult([]any{big.NewInt(math.MaxUint32)}))
			require.NoError(t, err)
			require.Equal(t, uint32(math.MaxUint32), got)

			_, err = getter.dec(ton.NewExecutionResult([]any{big.NewInt(math.MaxUint32 + 1)}))
			require.ErrorContains(t, err, "overflows uint32")

			_, err = getter.dec(ton.NewExecutionResult([]any{big.NewInt(-1)}))
			require.ErrorContains(t, err, "overflows uint32")

			_, err = getter.dec(ton.NewExecutionResult(nil))
			require.ErrorContains(t, err, "failed to extract value")
		})
	}
}
