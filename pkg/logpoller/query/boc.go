package query

import "github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

// bocByteScanner represents a sequential byte-level BOC data scanning operation.
type bocByteScanner interface {
	Apply(query *LogQuery, cursor uint64) (nextCursor uint64)
}

// bocBitScanner represents a bit-level BOC scanning operation with cursor advancement.
type bocBitScanner interface {
	Apply(query *LogQuery, cursor uint64) (nextCursor uint64)
}

type skipBytes struct {
	bytes uint64
}

func (s *skipBytes) Apply(query *LogQuery, cursor uint64) (nextCursor uint64) {
	return cursor + s.bytes
}

type matchBytes struct {
	size       uint64
	conditions []Condition
}

func (f *matchBytes) Apply(query *LogQuery, cursor uint64) (nextCursor uint64) {
	byteFilter := &ByteFilter{
		Offset:     cursor,
		Size:       f.size,
		Conditions: f.conditions,
	}
	query.ByteFilters = append(query.ByteFilters, byteFilter)
	return cursor + f.size
}

// SkipBytes creates a BocByteScanner that skips the specified number of bytes.
func SkipBytes(bytes uint64) bocByteScanner {
	return &skipBytes{bytes: bytes}
}

// MatchBytes creates a BocByteScanner that applies conditions to the specified number of bytes.
func MatchBytes(sizeInBytes uint64, conditions ...Condition) bocByteScanner {
	return &matchBytes{
		size:       sizeInBytes,
		conditions: conditions,
	}
}

type skipBits struct {
	bits uint64
}

func (s *skipBits) Apply(query *LogQuery, cursor uint64) (nextCursor uint64) {
	return cursor + s.bits
}

type matchBits struct {
	size       uint64
	conditions []Condition
}

func (f *matchBits) Apply(query *LogQuery, cursor uint64) (nextCursor uint64) {
	bitFilter := &BitFilter{
		Offset:     cursor,
		Size:       f.size,
		Conditions: f.conditions,
	}
	query.BitFilters = append(query.BitFilters, bitFilter)
	return cursor + f.size
}

// SkipBits creates a BocBitScanner that skips the specified number of bits.
func SkipBits(bits uint64) bocBitScanner {
	return &skipBits{bits: bits}
}

// MatchBit creates a BocBitScanner that filters a single bit at the current cursor position.
func MatchBit(expected bool) bocBitScanner {
	v := byte(0)
	if expected {
		v = 1
	}

	return &matchBits{
		size:       1,
		conditions: []Condition{{Operator: primitives.Eq, Value: []byte{v}}},
	}
}

// MatchBits creates a BocBitScanner that filters multiple bits at the current cursor position.
// The bit length is inferred from the value length (len(value) * 8).
func MatchBits(value []byte) bocBitScanner {
	return &matchBits{
		size:       uint64(len(value)) * 8,
		conditions: []Condition{{Operator: primitives.Eq, Value: value}},
	}
}
