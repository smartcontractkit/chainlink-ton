package logpoller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

// Mock store for testing
type mockLogStore struct {
	logs []types.Log
}

func (m *mockLogStore) SaveLog(log types.Log) {
	m.logs = append(m.logs, log)
}

func (m *mockLogStore) GetLogs(srcAddr *address.Address, sig uint32) ([]types.Log, error) {
	var result []types.Log
	for _, log := range m.logs {
		if log.EventSig == sig && log.Address.Equals(srcAddr) {
			result = append(result, log)
		}
	}
	return result, nil
}

// Mock event type for testing
type TestEvent struct {
	Value uint64 `tlb:"## 64"`
}

// Helper function to create an invalid cell that cannot be parsed as TestEvent
func createInvalidCell(t *testing.T) *cell.Cell {
	t.Helper()
	// Create a cell with insufficient data for TestEvent (needs 64 bits)
	builder := cell.BeginCell()
	builder.MustStoreUInt(42, 32) // Only 32 bits, but TestEvent expects 64
	return builder.EndCell()
}

// Helper function to create a test log with TLB-encoded TestEvent
func createTestLog(t *testing.T, addr *address.Address, sig uint32, value uint64) types.Log {
	// Create a TLB-encoded TestEvent
	event := TestEvent{Value: value}
	cell, err := tlb.ToCell(event)
	require.NoError(t, err)

	return types.Log{
		Address:  addr,
		EventSig: sig,
		Data:     cell,
		TxLT:     value * 100, // Use predictable TxLT for sorting tests
	}
}

func TestQueryBuilder_BasicFlow(t *testing.T) {
	store := &mockLogStore{}

	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithOptions(query.Options{Limit: 10})

	b, ok := builder.(*queryBuilder[TestEvent])
	require.True(t, ok, "type assertion to *queryBuilder[TestEvent] failed")

	// Verify builder state
	require.Equal(t, addr, b.address)
	require.Equal(t, uint32(123), b.eventSig)
	require.Equal(t, 10, b.options.Limit)
	require.Empty(t, b.byteFilters)
	require.Nil(t, b.typedFilter)
}

func TestQueryBuilder_WithFilters(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Test with byte filter
	byteFilter := query.ByteFilter{
		Offset:   0,
		Operator: query.GT,
		Value:    []byte{0, 0, 0, 5},
	}

	typedFilter := func(event TestEvent) bool {
		return event.Value > 10
	}

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithByteFilter(byteFilter).
		WithTypedFilter(typedFilter)

	b, ok := builder.(*queryBuilder[TestEvent])
	require.True(t, ok, "type assertion to *queryBuilder[TestEvent] failed")

	// Verify filters are set
	require.Len(t, b.byteFilters, 1)
	require.Equal(t, byteFilter, b.byteFilters[0])
	require.NotNil(t, b.typedFilter)
}

func TestQueryBuilder_RequiredAddress(t *testing.T) {
	store := &mockLogStore{}

	builder := NewQuery[TestEvent](store).
		WithEventSig(123)

	// Should fail without address
	_, err := builder.Execute(context.Background())
	require.Error(t, err)
	require.Contains(t, err.Error(), "address is required")
}

func TestQueryBuilder_RequiredSig(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr)
		// Missing Withsig call - sig should default to 0

	// Should fail without sig
	_, err = builder.Execute(context.Background())
	require.Error(t, err)
	require.Contains(t, err.Error(), "sig is required")
}

func TestQueryBuilder_Execute_BasicQuery(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test data with TLB-encoded TestEvent
	testLog := createTestLog(t, addr, 123, 42) // Value = 42
	store.SaveLog(testLog)

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 1)
	require.Len(t, result.Logs, 1)
	require.Equal(t, uint64(42), result.Events[0].Value)
	require.Equal(t, 1, result.Total)
	require.False(t, result.HasMore)
}

func TestQueryBuilder_Execute_WithTypedFilter(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create multiple test logs with different values
	store.SaveLog(createTestLog(t, addr, 123, 5))  // Should be filtered out
	store.SaveLog(createTestLog(t, addr, 123, 15)) // Should pass
	store.SaveLog(createTestLog(t, addr, 123, 25)) // Should pass
	store.SaveLog(createTestLog(t, addr, 123, 3))  // Should be filtered out

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithTypedFilter(func(event TestEvent) bool {
			return event.Value > 10
		})

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 2)
	require.Equal(t, uint64(15), result.Events[0].Value)
	require.Equal(t, uint64(25), result.Events[1].Value)
	require.Equal(t, 2, result.Total)
}

func TestQueryBuilder_Execute_WithByteFilter(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test logs with different values
	store.SaveLog(createTestLog(t, addr, 123, 5))   // 5 in 8 bytes: [0,0,0,0,0,0,0,5]
	store.SaveLog(createTestLog(t, addr, 123, 15))  // 15 in 8 bytes: [0,0,0,0,0,0,0,15]
	store.SaveLog(createTestLog(t, addr, 123, 255)) // 255 in 8 bytes: [0,0,0,0,0,0,0,255]

	// Filter for values greater than 10 (comparing last byte)
	byteFilter := query.ByteFilter{
		Offset:   7, // Last byte of the 64-bit value
		Operator: query.GT,
		Value:    []byte{10},
	}

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithByteFilter(byteFilter)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 2) // Should match 15 and 255
	require.Equal(t, 2, result.Total)
}

func TestQueryBuilder_Execute_WithPagination(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create multiple test logs
	for i := 0; i < 10; i++ {
		store.SaveLog(createTestLog(t, addr, 123, uint64(i))) //nolint:gosec // test code
	}

	// Test with limit
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithOptions(query.Options{Limit: 3})

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 3)
	require.Equal(t, 10, result.Total)
	require.True(t, result.HasMore)
	require.Equal(t, 3, result.Limit)

	// Test with offset
	builder = NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithOptions(query.Options{Offset: 5, Limit: 3})

	result, err = builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 3)
	require.Equal(t, 10, result.Total)
	require.True(t, result.HasMore)
	require.Equal(t, 5, result.Offset)
}

func TestQueryBuilder_Execute_NoMatches(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Add logs for a different sig
	store.SaveLog(createTestLog(t, addr, 456, 42))

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123) // Different sig

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Empty(t, result.Events)
	require.Empty(t, result.Logs)
	require.Equal(t, 0, result.Total)
	require.False(t, result.HasMore)
}

func TestQueryBuilder_Execute_DifferentAddresses(t *testing.T) {
	store := &mockLogStore{}
	addr1, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)
	addr2, err := address.ParseAddr("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")
	require.NoError(t, err)

	// Add logs for different addresses
	store.SaveLog(createTestLog(t, addr1, 123, 42))
	store.SaveLog(createTestLog(t, addr2, 123, 24))

	// Query for addr1 only
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr1).
		WithEventSig(123)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 1)
	require.Equal(t, uint64(42), result.Events[0].Value)
}

func TestQueryBuilder_Execute_CombinedFilters(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test logs
	store.SaveLog(createTestLog(t, addr, 123, 5))  // Fails typed filter (< 10)
	store.SaveLog(createTestLog(t, addr, 123, 15)) // Passes both filters
	store.SaveLog(createTestLog(t, addr, 123, 8))  // Fails typed filter (< 10)
	store.SaveLog(createTestLog(t, addr, 123, 25)) // Passes both filters

	// Byte filter for values > 4 and typed filter for values > 10
	byteFilter := query.ByteFilter{
		Offset:   7, // Last byte
		Operator: query.GT,
		Value:    []byte{4},
	}

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithByteFilter(byteFilter).
		WithTypedFilter(func(event TestEvent) bool {
			return event.Value > 10
		})

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 2) // Only 15 and 25 should pass
	require.Equal(t, 2, result.Total)
}

func TestQueryBuilder_Execute_InvalidCellData(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create a log with invalid cell data that cannot be parsed as TestEvent
	invalidLog := types.Log{
		ID:       1,
		Address:  addr,
		EventSig: 123,
		Data:     createInvalidCell(t), // Cell that can't be parsed as TestEvent
		TxLT:     100,
	}
	store.SaveLog(invalidLog)

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123)

	// Should return error when trying to parse invalid cell
	_, err = builder.Execute(context.Background())
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to parse log cell")
}

func TestByteComparison(t *testing.T) {
	tests := []struct {
		name     string
		a, b     []byte
		expected bool
	}{
		{"equal bytes", []byte{1, 2, 3}, []byte{1, 2, 3}, true},
		{"different bytes", []byte{1, 2, 3}, []byte{1, 2, 4}, false},
		{"greater bytes", []byte{1, 2, 4}, []byte{1, 2, 3}, true},
		{"less bytes", []byte{1, 2, 2}, []byte{1, 2, 3}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			switch tt.name {
			case "equal bytes", "different bytes":
				require.Equal(t, tt.expected, bytesEqual(tt.a, tt.b))
			case "greater bytes":
				require.Equal(t, tt.expected, bytesGreater(tt.a, tt.b))
			case "less bytes":
				require.Equal(t, tt.expected, bytesLess(tt.a, tt.b))
			}
		})
	}
}

func TestMockLogStore_SaveAndRetrieve(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Test saving logs
	log1 := createTestLog(t, addr, 123, 42)
	log2 := createTestLog(t, addr, 456, 24)
	log3 := createTestLog(t, addr, 123, 84)

	store.SaveLog(log1)
	store.SaveLog(log2)
	store.SaveLog(log3)

	// Test retrieving logs by sig
	logs123, err := store.GetLogs(addr, 123)
	require.NoError(t, err)
	require.Len(t, logs123, 2)

	logs456, err := store.GetLogs(addr, 456)
	require.NoError(t, err)
	require.Len(t, logs456, 1)

	// Test retrieving logs for non-existent sig
	logsNone, err := store.GetLogs(addr, 999)
	require.NoError(t, err)
	require.Empty(t, logsNone)
}

func TestMockLogStore_DifferentAddresses(t *testing.T) {
	store := &mockLogStore{}
	addr1, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)
	addr2, err := address.ParseAddr("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")
	require.NoError(t, err)

	// Save logs for different addresses with same sig
	log1 := createTestLog(t, addr1, 123, 42)
	log2 := createTestLog(t, addr2, 123, 24)

	store.SaveLog(log1)
	store.SaveLog(log2)

	// Verify each address only gets its own logs
	logs1, err := store.GetLogs(addr1, 123)
	require.NoError(t, err)
	require.Len(t, logs1, 1)
	require.True(t, logs1[0].Address.Equals(addr1))

	logs2, err := store.GetLogs(addr2, 123)
	require.NoError(t, err)
	require.Len(t, logs2, 1)
	require.True(t, logs2[0].Address.Equals(addr2))
}

func TestQueryBuilder_ExecuteWithLargeDataset(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create a large dataset
	for i := 0; i < 100; i++ {
		store.SaveLog(createTestLog(t, addr, 123, uint64(i))) //nolint:gosec // test code
	}

	// Test basic query returns all data
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 100)
	require.Equal(t, 100, result.Total)
	require.False(t, result.HasMore)
}

func TestQueryBuilder_ExecuteWithComplexFiltering(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test data with various values
	testValues := []uint64{5, 10, 15, 20, 25, 30, 35, 40, 45, 50}
	for _, val := range testValues {
		store.SaveLog(createTestLog(t, addr, 123, val))
	}

	// Test typed filter: values > 20 and < 40
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithTypedFilter(func(event TestEvent) bool {
			return event.Value > 20 && event.Value < 40
		})

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 3) // 25, 30, 35
	require.Equal(t, 3, result.Total)

	// Verify the values
	expectedValues := []uint64{25, 30, 35}
	for i, event := range result.Events {
		require.Equal(t, expectedValues[i], event.Value)
	}
}

func TestQueryBuilder_ExecuteWithPaginationAndFiltering(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test data: even numbers from 0 to 18
	for i := 0; i < 10; i++ {
		store.SaveLog(createTestLog(t, addr, 123, uint64(i*2))) //nolint:gosec // test code
	}

	// Filter for values >= 6 with pagination
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithTypedFilter(func(event TestEvent) bool {
			return event.Value >= 6
		}).
		WithOptions(query.Options{Limit: 3, Offset: 1})

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 3)
	require.Equal(t, 7, result.Total) // Values: 6,8,10,12,14,16,18
	require.True(t, result.HasMore)
	require.Equal(t, 3, result.Limit)
	require.Equal(t, 1, result.Offset)
}

func TestQueryBuilder_ExecuteMultipleByteFilters(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test data
	testValues := []uint64{100, 200, 300, 400, 500}
	for _, val := range testValues {
		store.SaveLog(createTestLog(t, addr, 123, val))
	}

	// Multiple byte filters: value > 150 AND value < 450
	filter1 := query.ByteFilter{
		Offset:   6, // Check higher bytes
		Operator: query.GT,
		Value:    []byte{0, 150}, // > 150
	}
	filter2 := query.ByteFilter{
		Offset:   6,
		Operator: query.LT,
		Value:    []byte{1, 194}, // < 450
	}

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123).
		WithByteFilter(filter1).
		WithByteFilter(filter2)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	// Should match 200, 300, 400 (between 150 and 450)
	require.Len(t, result.Events, 3)
	require.Equal(t, 3, result.Total)
}

func TestQueryBuilder_ExecuteEmptyStore(t *testing.T) {
	store := &mockLogStore{} // Empty store
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(123)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Empty(t, result.Events)
	require.Empty(t, result.Logs)
	require.Equal(t, 0, result.Total)
	require.False(t, result.HasMore)
}

func TestQueryBuilder_ExecuteWithMixedSigs(t *testing.T) {
	store := &mockLogStore{}
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Add logs with different sigs
	for i := 0; i < 5; i++ {
		store.SaveLog(createTestLog(t, addr, 123, uint64(i)))    //nolint:gosec // test code
		store.SaveLog(createTestLog(t, addr, 456, uint64(i+10))) //nolint:gosec // test code
		store.SaveLog(createTestLog(t, addr, 789, uint64(i+20))) //nolint:gosec // test code
	}

	// Query for specific sig
	builder := NewQuery[TestEvent](store).
		WithSrcAddress(addr).
		WithEventSig(456)

	result, err := builder.Execute(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Events, 5)
	require.Equal(t, 5, result.Total)

	// Verify all events have values from the correct sig (10-14)
	for i, event := range result.Events {
		require.Equal(t, uint64(i+10), event.Value) //nolint:gosec // test code
	}
}
