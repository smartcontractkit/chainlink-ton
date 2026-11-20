package postgres

import (
	"fmt"
	"math"
)

// toUint32 converts a BIGINT column value to uint32, erroring if it is out of range.
func toUint32(v int64, field string) (uint32, error) {
	if v < 0 || v > math.MaxUint32 {
		return 0, fmt.Errorf("%s value %d is out of uint32 range", field, v)
	}
	return uint32(v), nil
}

// toInt32 converts an INT column value to int32, erroring if it is out of range.
func toInt32(v int, field string) (int32, error) {
	if v < math.MinInt32 || v > math.MaxInt32 {
		return 0, fmt.Errorf("%s value %d is out of int32 range", field, v)
	}
	return int32(v), nil
}
