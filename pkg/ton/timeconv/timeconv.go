// Package timeconv converts time values to the fixed-width integers used by TON and the database,
// returning an error instead of silently wrapping when a value does not fit.
package timeconv

import (
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
	return uint32(sec), nil //nolint:gosec // G115: range checked above
}

// UnixMillisU64 returns t as a Unix timestamp in milliseconds. It errors if t is before 1970.
func UnixMillisU64(t time.Time) (uint64, error) {
	ms := t.UnixMilli()
	if ms < 0 {
		return 0, fmt.Errorf("timestamp %s is before the unix epoch", t.UTC().Format(time.RFC3339))
	}
	return uint64(ms), nil //nolint:gosec // G115: non-negative, checked above
}
