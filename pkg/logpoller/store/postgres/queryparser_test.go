package postgres

import (
	"encoding/binary"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

// normalizeSQL removes extra whitespace and normalizes spacing for SQL comparison
func normalizeSQL(sql string) string {
	// Replace multiple whitespace characters with single space
	re := regexp.MustCompile(`\s+`)
	normalized := re.ReplaceAllString(sql, " ")
	// Trim leading/trailing spaces
	return strings.TrimSpace(normalized)
}

// sqlMatches compares SQL strings after normalizing whitespace and logs differences
func sqlMatches(t *testing.T, expected, actual string) bool {
	t.Helper()

	expectedNorm := normalizeSQL(expected)
	actualNorm := normalizeSQL(actual)

	if expectedNorm != actualNorm {
		t.Logf("SQL mismatch:")
		t.Logf("Expected: %s", expectedNorm)
		t.Logf("Actual  : %s", actualNorm)
		return false
	}
	return true
}

func TestBuildLogQuery_BasicQuery(t *testing.T) {
	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{
				Field:    "address",
				Operator: primitives.Eq,
				Value:    addr,
			},
			{
				Field:    "event_sig",
				Operator: primitives.Eq,
				Value:    uint32(424129320),
			},
		},
	})

	require.NoError(t, err)

	// Check exact SQL structure
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY address ASC, msg_lt ASC`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	// Check parameters - address should be converted to bytea by queryParser
	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
	require.IsType(t, []byte{}, params["address"]) // Should be bytea after conversion

	// event_sig should be converted to []byte for DB query
	expectedEventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(expectedEventSig, 424129320)
	require.Equal(t, expectedEventSig, params["event_sig"])
}

func TestBuildLogQuery_WithByteFilters(t *testing.T) {
	byteFilters := []*query.ByteFilter{
		{
			Offset: 4,
			Size:   8,
			Conditions: []query.Condition{
				{
					Operator: primitives.Eq,
					Value:    []byte{0x00, 0x00, 0x01, 0x00},
				},
			},
		},
	}

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		ByteFilters:  byteFilters,
		LimitAndSort: commonquery.LimitAndSort{},
	})

	require.NoError(t, err)

	// Check exact SQL with byte filter: 4 + 1 + 2 = 7, size = 8 (filter.Size)
	// Note: offset calculation changed from TonBocHeaderSize (14) to CellDescriptorSize (2)
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND SUBSTRING(data_payload, 7, 8) = :byte_value_0 ORDER BY address ASC, msg_lt ASC`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	// Check parameters
	params := args.(map[string]any)
	require.Equal(t, []byte{0x00, 0x00, 0x01, 0x00}, params["byte_value_0"])
}

func TestBuildLogQuery_WithLimit(t *testing.T) {
	limitAndSort := commonquery.NewLimitAndSort(commonquery.CountLimit(10))

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	})

	require.NoError(t, err)

	// Check exact SQL with LIMIT (+1 for hasMore detection)
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY address ASC, msg_lt ASC LIMIT 11`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
}

func TestBuildLogQuery_WithSorting(t *testing.T) {
	limitAndSort := commonquery.NewLimitAndSort(
		commonquery.Limit{},
		query.NewTxLTSort(commonquery.Desc),
	)

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	},
	)

	require.NoError(t, err)

	// Check exact SQL with ORDER BY
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY tx_lt DESC`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
}

func TestBuildLogQuery_WithCursor(t *testing.T) {
	// Create a valid cursor for pagination (address:msgLT format)
	cursor := "EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF:1000"
	limitAndSort := commonquery.NewLimitAndSort(
		commonquery.CursorLimit(cursor, commonquery.CursorFollowing, 5),
	)

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	},
	)

	require.NoError(t, err)

	// Check exact SQL with cursor condition (PostgreSQL tuple comparison)
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (address, msg_lt) > (:cursor_address, :cursor_msg_lt) ORDER BY address ASC, msg_lt ASC LIMIT 6`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	// Check parameters include cursor values (cursor is converted to bytea by queryParser)
	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
	require.IsType(t, []byte{}, params["cursor_address"])
	require.Equal(t, "1000", params["cursor_msg_lt"]) // 1000 from cursor (string for NUMERIC compatibility)
}

func TestBuildLogQuery_InvalidByteFilter(t *testing.T) {
	byteFilters := []*query.ByteFilter{
		{
			Offset: 0,
			Size:   4,
			Conditions: []query.Condition{
				{
					Operator: 999, // Invalid operator value
					Value:    []byte{0x01},
				},
			},
		},
	}

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	_, _, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		ByteFilters:  byteFilters,
		LimitAndSort: commonquery.LimitAndSort{},
	},
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to add byte filter")
}

func TestBuildLogQuery_InvalidCursor(t *testing.T) {
	limitAndSort := commonquery.NewLimitAndSort(
		commonquery.CursorLimit("invalid-cursor-format", commonquery.CursorFollowing, 5),
	)

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	_, _, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to add cursor filter")
}

func TestBuildLogQuery_WithSingleBitFilter(t *testing.T) {
	// Test single bit filtering - checking if bit at offset 0 (first bit after descriptor) equals 1
	bitFilters := []*query.BitFilter{
		{
			Offset: 0, // First bit after cell descriptor
			Size:   1, // Single bit
			Conditions: []query.Condition{
				{
					Operator: primitives.Eq,
					Value:    []byte{1}, // Bit value 1 (from MatchBit(true))
				},
			},
		},
	}

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		BitFilters:   bitFilters,
		LimitAndSort: commonquery.LimitAndSort{},
	})

	require.NoError(t, err)

	// Bit 0 after descriptor (offset 0) → adjustedBit = 0 + 16 = 16
	// convertToPostgresBitOffset(16) → byte_index=2, bit_in_byte=0 → 2*8 + (7-0) = 23
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (get_bit(data_payload, 23) = 1) ORDER BY address ASC, msg_lt ASC`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
}

func TestBuildLogQuery_WithMultiBitFilter(t *testing.T) {
	// Test multi-bit filtering - checking if 8 bits match pattern 10000110 (0x86)
	bitFilters := []*query.BitFilter{
		{
			Offset: 0, // First 8 bits after cell descriptor
			Size:   8, // Full byte
			Conditions: []query.Condition{
				{
					Operator: primitives.Eq,
					Value:    []byte{0x86}, // Binary: 10000110
				},
			},
		},
	}

	addr, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	sql, args, err := newQueryParser("test-chain").Parse(&query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: addr},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		BitFilters:   bitFilters,
		LimitAndSort: commonquery.LimitAndSort{},
	})

	require.NoError(t, err)

	// Multi-bit generates AND conditions for each bit
	// Bits 0-7 (offset 0-7) → adjustedBits 16-23 → PostgreSQL bits 23-16 (reversed)
	// Value 0x86 = 10000110 → bits: 1,0,0,0,0,1,1,0
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (get_bit(data_payload, 23) = 1 AND get_bit(data_payload, 22) = 0 AND get_bit(data_payload, 21) = 0 AND get_bit(data_payload, 20) = 0 AND get_bit(data_payload, 19) = 0 AND get_bit(data_payload, 18) = 1 AND get_bit(data_payload, 17) = 1 AND get_bit(data_payload, 16) = 0) ORDER BY address ASC, msg_lt ASC`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
}

func TestConvertToPostgresBitOffset(t *testing.T) {
	tests := []struct {
		name          string
		ourBit        uint64
		expectedPgBit uint64
		description   string
	}{
		{
			name:          "First bit of byte 0",
			ourBit:        0,
			expectedPgBit: 7,
			description:   "Our bit 0 (MSB of byte 0) → PostgreSQL bit 7",
		},
		{
			name:          "Last bit of byte 0",
			ourBit:        7,
			expectedPgBit: 0,
			description:   "Our bit 7 (LSB of byte 0) → PostgreSQL bit 0",
		},
		{
			name:          "First bit of byte 2 (after descriptor)",
			ourBit:        16,
			expectedPgBit: 23,
			description:   "Our bit 16 (MSB of byte 2) → PostgreSQL bit 23",
		},
		{
			name:          "Last bit of byte 2",
			ourBit:        23,
			expectedPgBit: 16,
			description:   "Our bit 23 (LSB of byte 2) → PostgreSQL bit 16",
		},
		{
			name:          "Middle bit of byte 3",
			ourBit:        28,
			expectedPgBit: 27,
			description:   "Our bit 28 (bit 4 of byte 3) → PostgreSQL bit 27",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertToPostgresBitOffset(tt.ourBit)
			require.Equal(t, tt.expectedPgBit, result, tt.description)
		})
	}
}

func TestBytesToBitString(t *testing.T) {
	parser := &queryParser{}

	tests := []struct {
		name     string
		value    []byte
		size     uint64
		expected string
	}{
		{
			name:     "Full byte 0x86",
			value:    []byte{0x86},
			size:     8,
			expected: "10000110",
		},
		{
			name:     "Full byte 0xFF",
			value:    []byte{0xFF},
			size:     8,
			expected: "11111111",
		},
		{
			name:     "Partial byte (5 bits from 0xF8 = 11111000)",
			value:    []byte{0xF8},
			size:     5,
			expected: "11111",
		},
		{
			name:     "Two bytes",
			value:    []byte{0xAB, 0xCD},
			size:     16,
			expected: "1010101111001101",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parser.bytesToBitString(tt.value, tt.size)
			require.Equal(t, tt.expected, result)
		})
	}
}
