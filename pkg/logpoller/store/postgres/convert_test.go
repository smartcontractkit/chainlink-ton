package postgres

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestToUint32(t *testing.T) {
	for _, v := range []int64{0, 1, math.MaxUint32} {
		got, err := toUint32(v, "f")
		require.NoError(t, err)
		require.Equal(t, uint32(v), got)
	}
	for _, v := range []int64{-1, math.MaxUint32 + 1, math.MinInt64, math.MaxInt64} {
		_, err := toUint32(v, "f")
		require.ErrorContains(t, err, "f value")
	}
}

func TestToInt32(t *testing.T) {
	for _, v := range []int{math.MinInt32, -1, 0, math.MaxInt32} {
		got, err := toInt32(v, "f")
		require.NoError(t, err)
		require.Equal(t, int32(v), got)
	}
	for _, v := range []int{math.MinInt32 - 1, math.MaxInt32 + 1} {
		_, err := toInt32(v, "f")
		require.ErrorContains(t, err, "f value")
	}
}
