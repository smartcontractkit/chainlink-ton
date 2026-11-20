package wrappers

import (
	"math"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/ton"
)

func TestNewUint32Getter(t *testing.T) {
	getter := NewUint32Getter("value")
	require.Equal(t, "value", getter.Name)

	got, err := getter.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(math.MaxUint32)}))
	require.NoError(t, err)
	require.Equal(t, uint32(math.MaxUint32), got)

	_, err = getter.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(math.MaxUint32 + 1)}))
	require.ErrorContains(t, err, "out of range")

	_, err = getter.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(-1)}))
	require.ErrorContains(t, err, "out of range")

	_, err = getter.Decoder.Decode(ton.NewExecutionResult(nil))
	require.ErrorContains(t, err, "failed to extract value")
}

func TestNewUint64Getter(t *testing.T) {
	getter := NewUint64Getter("value")
	require.Equal(t, "value", getter.Name)

	got, err := getter.Decoder.Decode(ton.NewExecutionResult([]any{new(big.Int).SetUint64(math.MaxUint64)}))
	require.NoError(t, err)
	require.Equal(t, uint64(math.MaxUint64), got)

	tooBig := new(big.Int).Add(new(big.Int).SetUint64(math.MaxUint64), big.NewInt(1))
	_, err = getter.Decoder.Decode(ton.NewExecutionResult([]any{tooBig}))
	require.ErrorContains(t, err, "out of range")

	_, err = getter.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(-1)}))
	require.ErrorContains(t, err, "out of range")
}
