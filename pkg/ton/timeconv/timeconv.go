// Package timeconv converts time values to the fixed-width integers used by TON and the database,
// returning an error instead of silently wrapping when a value does not fit.
package timeconv

import (
	"errors"
	"fmt"
	"math"
	"time"
)

// UnixSeconds32 returns t as a Unix timestamp in seconds, the uint32 representation TON uses for
// message created_at. It errors if t is before 1970 or after 2106-02-07.
func UnixSeconds32(t time.Time) (uint32, error) {
	sec := t.Unix()
	if sec < 0 || sec > math.MaxUint32 {
		return 0, fmt.Errorf("timestamp %s is outside the uint32 unix seconds range", t.UTC().Format(time.RFC3339))
	}
	return uint32(sec), nil
}

// UnixMillisU64 returns t as a Unix timestamp in milliseconds. It errors if t is before 1970 or
// if the millisecond value does not fit in a uint64. The seconds are checked before scaling because
// time.Time.UnixMilli wraps silently for timestamps far from the epoch.
func UnixMillisU64(t time.Time) (uint64, error) {
	sec := t.Unix()
	if sec < 0 {
		return 0, fmt.Errorf("timestamp %s is before the unix epoch", t.UTC().Format(time.RFC3339))
	}
	millis := uint64(t.Nanosecond() / int(time.Millisecond)) //nolint:gosec // G115: Nanosecond() is in [0, 999999999], so this is 0..999
	if uint64(sec) > (math.MaxUint64-millis)/1000 {
		return 0, fmt.Errorf("timestamp %d seconds is outside the uint64 unix milliseconds range", sec)
	}
	return uint64(sec)*1000 + millis, nil
}

// BlockCount returns the number of blocks of length blockTime needed to cover d, rounded up and
// never less than one. It errors if d is negative, blockTime is not positive, or the count does
// not fit in a uint32.
func BlockCount(d, blockTime time.Duration) (uint32, error) {
	if d < 0 {
		return 0, fmt.Errorf("duration must not be negative, got %s", d)
	}
	if blockTime <= 0 {
		return 0, errors.New("block time must be positive")
	}
	if d == 0 {
		return 1, nil
	}
	// For d >= 1, ceil(d/blockTime) = (d-1)/blockTime + 1.
	count := int64((d-1)/blockTime) + 1
	if count > math.MaxUint32 {
		return 0, fmt.Errorf("%s of %s blocks (%d) exceeds the uint32 block count range", d, blockTime, count)
	}
	return uint32(count), nil //nolint:gosec // G115: range checked above, count >= 1
}
