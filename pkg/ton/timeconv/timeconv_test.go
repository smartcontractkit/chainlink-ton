package timeconv

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnixSeconds32(t *testing.T) {
	got, err := UnixSeconds32(time.Unix(1_700_000_000, 0))
	require.NoError(t, err)
	assert.Equal(t, uint32(1_700_000_000), got)

	got, err = UnixSeconds32(time.Unix(math.MaxUint32, 0))
	require.NoError(t, err)
	assert.Equal(t, uint32(math.MaxUint32), got)

	_, err = UnixSeconds32(time.Unix(math.MaxUint32+1, 0))
	require.Error(t, err)

	_, err = UnixSeconds32(time.Unix(-1, 0))
	require.Error(t, err)

	_, err = UnixSeconds32(time.Time{})
	require.Error(t, err)
}

func TestUnixMillisU64(t *testing.T) {
	got, err := UnixMillisU64(time.UnixMilli(1_700_000_000_123))
	require.NoError(t, err)
	assert.Equal(t, uint64(1_700_000_000_123), got)

	_, err = UnixMillisU64(time.UnixMilli(-1))
	require.Error(t, err)

	_, err = UnixMillisU64(time.Time{})
	require.Error(t, err)
}
