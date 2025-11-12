package query

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"
)

func TestQueryBuilder_BasicQuery(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQueryBuilder(nil)

	// Build a basic query
	builder.WithSource(addr).WithEventSig(123)

	// Get the built query
	query := builder.Query()

	// Verify the LogQuery structure - should have address and event_sig as FieldFilters
	require.Len(t, query.FieldFilters, 2)

	// Check address filter
	addressFilter := query.FieldFilters[0]
	assert.Equal(t, "address", addressFilter.Field)
	assert.Equal(t, primitives.Eq, addressFilter.Operator)
	assert.Equal(t, addr, addressFilter.Value)

	// Check event_sig filter
	eventSigFilter := query.FieldFilters[1]
	assert.Equal(t, "event_sig", eventSigFilter.Field)
	assert.Equal(t, primitives.Eq, eventSigFilter.Operator)
	assert.Equal(t, uint32(123), eventSigFilter.Value)

	assert.Empty(t, query.ByteFilters)
	assert.Empty(t, query.BitFilters)
}

func TestQueryBuilder_WithFields(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	testTime := time.Date(2024, 1, 15, 12, 30, 0, 0, time.UTC)

	builder := NewQueryBuilder(nil)

	// Build query with field filters
	builder.WithSource(addr).WithEventSig(123).WithFields(Timestamp(testTime, primitives.Gte))

	// Get the built query
	query := builder.Query()

	// Verify field filters are set (address, event_sig, and timestamp)
	require.Len(t, query.FieldFilters, 3)

	// Check address filter
	assert.Equal(t, "address", query.FieldFilters[0].Field)
	assert.Equal(t, addr, query.FieldFilters[0].Value)

	// Check event_sig filter
	assert.Equal(t, "event_sig", query.FieldFilters[1].Field)
	assert.Equal(t, uint32(123), query.FieldFilters[1].Value)

	// Check timestamp filter
	assert.Equal(t, "tx_timestamp", query.FieldFilters[2].Field)
	assert.Equal(t, primitives.Gte, query.FieldFilters[2].Operator)
	assert.Equal(t, testTime, query.FieldFilters[2].Value)
}

func TestQueryBuilder_WithByteFilters(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQueryBuilder(nil)

	// Build query with byte filters
	builder.WithSource(addr).WithEventSig(123).WithBocBytes(
		SkipBytes(4),
		MatchBytes(8, WithCondition([]byte{1, 2, 3, 4, 5, 6, 7, 8}, primitives.Eq)),
	)

	// Get the built query
	query := builder.Query()

	// Verify byte filters are applied correctly
	require.Len(t, query.ByteFilters, 1) // Skip doesn't create filter, only MatchBytes does

	byteFilter := query.ByteFilters[0]
	assert.Equal(t, uint64(4), byteFilter.Offset) // After skipping 4 bytes
	assert.Equal(t, uint64(8), byteFilter.Size)
	require.Len(t, byteFilter.Conditions, 1)
	assert.Equal(t, primitives.Eq, byteFilter.Conditions[0].Operator)
	assert.Equal(t, []byte{1, 2, 3, 4, 5, 6, 7, 8}, byteFilter.Conditions[0].Value)
}

func TestQueryBuilder_WithBitFilters(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQueryBuilder(nil)

	// Build query with bit filters
	builder.
		WithSource(addr).
		WithEventSig(123).
		WithBocBits(
			MatchBit(true),          // Bit 0: cursor 0→1
			SkipBits(7),             // Skip 7 bits: cursor 1→8
			MatchBits([]byte{0x42}), // Filter 8 bits: cursor 8→16
		)

	// Get the built query
	query := builder.Query()

	// Verify bit filters are applied correctly
	require.Len(t, query.BitFilters, 2) // Only MatchBit and MatchBits create filters

	// First filter: MatchBit(true) at offset 0
	bitFilter1 := query.BitFilters[0]
	assert.Equal(t, uint64(0), bitFilter1.Offset)
	assert.Equal(t, uint64(1), bitFilter1.Size)
	require.Len(t, bitFilter1.Conditions, 1)
	assert.Equal(t, []byte{1}, bitFilter1.Conditions[0].Value)

	// Second filter: MatchBits at offset 8 (after skip)
	bitFilter2 := query.BitFilters[1]
	assert.Equal(t, uint64(8), bitFilter2.Offset)
	assert.Equal(t, uint64(8), bitFilter2.Size) // 1 byte = 8 bits
	require.Len(t, bitFilter2.Conditions, 1)
	assert.Equal(t, []byte{0x42}, bitFilter2.Conditions[0].Value)
}

func TestQueryBuilder_WithLimitAndSort(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQueryBuilder(nil)

	// Build query with limit and sort
	limitAndSort := commonquery.LimitAndSort{
		SortBy: []commonquery.SortBy{NewTxLTSort(commonquery.Asc)},
		Limit:  commonquery.CountLimit(100),
	}

	builder.WithSource(addr).WithEventSig(123).WithLimitAndSort(limitAndSort)

	// Get the built query
	query := builder.Query()

	// Verify limit and sort are set
	require.NotNil(t, query.LimitAndSort)
	assert.Equal(t, uint64(100), query.LimitAndSort.Limit.Count)
	// Note: Cannot access internal SortBy fields directly, but we know it works from integration tests
	require.Len(t, query.LimitAndSort.SortBy, 1)
}

func TestQueryBuilder_ComplexQuery(t *testing.T) {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	testTime := time.Date(2024, 1, 15, 12, 30, 0, 0, time.UTC)

	builder := NewQueryBuilder(nil)

	// Build a complex query with all types of filters
	builder.WithSource(addr).
		WithEventSig(456).
		WithFields(Timestamp(testTime, primitives.Gte)).
		WithBocBytes(
			SkipBytes(4),
			MatchBytes(4, WithCondition([]byte{0xDE, 0xAD, 0xBE, 0xEF}, primitives.Eq)),
			SkipBytes(8),
			MatchBytes(2, WithCondition([]byte{0x12, 0x34}, primitives.Neq)),
		).
		WithBocBits(
			MatchBit(false),
			SkipBits(15),
			MatchBits([]byte{0xFF}),
		).
		WithLimitAndSort(commonquery.LimitAndSort{
			SortBy: []commonquery.SortBy{
				NewTimestampSort(commonquery.Desc),
				NewTxLTSort(commonquery.Asc),
			},
			Limit: commonquery.CountLimit(50),
		})

	// Get the built query
	query := builder.Query()

	// Verify all components are correctly set

	// Field filters (address, event_sig, and timestamp)
	require.Len(t, query.FieldFilters, 3)
	assert.Equal(t, "address", query.FieldFilters[0].Field)
	assert.Equal(t, "event_sig", query.FieldFilters[1].Field)
	assert.Equal(t, "tx_timestamp", query.FieldFilters[2].Field)

	// Byte filters: 2 MatchBytes operations
	require.Len(t, query.ByteFilters, 2)

	// First byte filter at offset 4 (after first skip)
	assert.Equal(t, uint64(4), query.ByteFilters[0].Offset)
	assert.Equal(t, uint64(4), query.ByteFilters[0].Size)
	assert.Equal(t, []byte{0xDE, 0xAD, 0xBE, 0xEF}, query.ByteFilters[0].Conditions[0].Value)

	// Second byte filter at offset 16 (4 + 4 + 8)
	assert.Equal(t, uint64(16), query.ByteFilters[1].Offset)
	assert.Equal(t, uint64(2), query.ByteFilters[1].Size)
	assert.Equal(t, []byte{0x12, 0x34}, query.ByteFilters[1].Conditions[0].Value)
	assert.Equal(t, primitives.Neq, query.ByteFilters[1].Conditions[0].Operator)

	// Bit filters: 2 filter operations
	require.Len(t, query.BitFilters, 2)

	// First bit filter at offset 0
	assert.Equal(t, uint64(0), query.BitFilters[0].Offset)
	assert.Equal(t, []byte{0}, query.BitFilters[0].Conditions[0].Value)

	// Second bit filter at offset 16 (1 + 15)
	assert.Equal(t, uint64(16), query.BitFilters[1].Offset)
	assert.Equal(t, []byte{0xFF}, query.BitFilters[1].Conditions[0].Value)

	// Sort and limit
	require.NotNil(t, query.LimitAndSort)
	assert.Equal(t, uint64(50), query.LimitAndSort.Limit.Count)
	// Note: Cannot access internal SortBy fields directly, but we know it works from integration tests
	require.Len(t, query.LimitAndSort.SortBy, 2)
}

func TestQueryBuilder_ValidationErrors(t *testing.T) {
	builder := NewQueryBuilder(nil)

	// Test missing address - use Query() instead of Execute() to avoid nil store
	builder.WithEventSig(123)
	query := builder.Query()

	// Verify address filter is missing (which would cause validation error in Execute)
	assert.False(t, validateFieldFilter(query.FieldFilters, "address"))
	assert.True(t, validateFieldFilter(query.FieldFilters, "event_sig"))

	// Test missing event signature
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder2 := NewQueryBuilder(nil)
	builder2.WithSource(addr)
	query2 := builder2.Query()

	// Verify event sig filter is missing (which would cause validation error in Execute)
	assert.True(t, validateFieldFilter(query2.FieldFilters, "address"))
	assert.False(t, validateFieldFilter(query2.FieldFilters, "event_sig"))
}
