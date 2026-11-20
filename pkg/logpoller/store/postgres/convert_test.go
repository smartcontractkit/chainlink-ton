package postgres

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestToUint32(t *testing.T) {
	for in, want := range map[int64]uint32{0: 0, 1: 1, math.MaxUint32: math.MaxUint32} {
		got, err := toUint32(in, "f")
		require.NoError(t, err)
		require.Equal(t, want, got)
	}
	for _, v := range []int64{-1, math.MaxUint32 + 1, math.MinInt64, math.MaxInt64} {
		_, err := toUint32(v, "f")
		require.ErrorContains(t, err, "f value")
	}
}

func TestToInt32(t *testing.T) {
	for in, want := range map[int]int32{math.MinInt32: math.MinInt32, -1: -1, 0: 0, math.MaxInt32: math.MaxInt32} {
		got, err := toInt32(in, "f")
		require.NoError(t, err)
		require.Equal(t, want, got)
	}
	for _, v := range []int{math.MinInt32 - 1, math.MaxInt32 + 1} {
		_, err := toInt32(v, "f")
		require.ErrorContains(t, err, "f value")
	}
}
