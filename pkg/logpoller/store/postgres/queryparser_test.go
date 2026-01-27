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

func TestBuildLogQuery(t *testing.T) {
	t.Parallel()

	// Common test address
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	tests := []struct {
		name          string
		chainID       string
		query         *query.LogQuery
		expectedSQL   string
		expectedError string
		checkParams   func(t *testing.T, params map[string]any)
	}{
		{
			name:    "basic query",
			chainID: "test-chain",
			query: &query.LogQuery{
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
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY address ASC, msg_lt ASC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
				require.IsType(t, []byte{}, params["address"])
				expectedEventSig := make([]byte, 4)
				binary.BigEndian.PutUint32(expectedEventSig, 424129320)
				require.Equal(t, expectedEventSig, params["event_sig"])
			},
		},
		{
			name:    "with byte filters",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				ByteFilters: []*query.ByteFilter{
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
				},
				LimitAndSort: commonquery.LimitAndSort{},
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND SUBSTRING(data_payload, 7, 8) = :byte_value_0 ORDER BY address ASC, msg_lt ASC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, []byte{0x00, 0x00, 0x01, 0x00}, params["byte_value_0"])
			},
		},
		{
			name:    "with limit",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(commonquery.CountLimit(10)),
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY address ASC, msg_lt ASC LIMIT 11`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
		{
			name:    "with sorting by tx_lt descending",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(
					commonquery.Limit{},
					query.NewTxLTSort(commonquery.Desc),
				),
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY tx_lt DESC, msg_index DESC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
		{
			name:    "with timestamp sorting ascending",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(
					commonquery.Limit{},
					query.NewTimestampSort(commonquery.Asc),
				),
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY tx_timestamp ASC, tx_lt ASC, msg_index ASC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
		{
			name:    "with timestamp sorting descending",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(
					commonquery.Limit{},
					query.NewTimestampSort(commonquery.Desc),
				),
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig ORDER BY tx_timestamp DESC, tx_lt DESC, msg_index DESC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
		{
			name:    "with cursor pagination",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(
					commonquery.CursorLimit("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF:1000", commonquery.CursorFollowing, 5),
				),
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (address, msg_lt) > (:cursor_address, :cursor_msg_lt) ORDER BY address ASC, msg_lt ASC LIMIT 6`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
				require.IsType(t, []byte{}, params["cursor_address"])
				require.Equal(t, "1000", params["cursor_msg_lt"])
			},
		},
		{
			name:    "invalid byte filter operator",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				ByteFilters: []*query.ByteFilter{
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
				},
				LimitAndSort: commonquery.LimitAndSort{},
			},
			expectedError: "failed to add byte filter",
		},
		{
			name:    "invalid cursor format",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				LimitAndSort: commonquery.NewLimitAndSort(
					commonquery.CursorLimit("invalid-cursor-format", commonquery.CursorFollowing, 5),
				),
			},
			expectedError: "failed to add cursor filter",
		},
		{
			name:    "with single bit filter",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				BitFilters: []*query.BitFilter{
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
				},
				LimitAndSort: commonquery.LimitAndSort{},
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (get_bit(data_payload, 23) = 1) ORDER BY address ASC, msg_lt ASC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
		{
			name:    "with multi-bit filter",
			chainID: "test-chain",
			query: &query.LogQuery{
				FieldFilters: []*query.FieldFilter{
					{Field: "address", Operator: primitives.Eq, Value: addr},
					{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
				},
				BitFilters: []*query.BitFilter{
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
				},
				LimitAndSort: commonquery.LimitAndSort{},
			},
			expectedSQL: `SELECT DISTINCT chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (get_bit(data_payload, 23) = 1 AND get_bit(data_payload, 22) = 0 AND get_bit(data_payload, 21) = 0 AND get_bit(data_payload, 20) = 0 AND get_bit(data_payload, 19) = 0 AND get_bit(data_payload, 18) = 1 AND get_bit(data_payload, 17) = 1 AND get_bit(data_payload, 16) = 0) ORDER BY address ASC, msg_lt ASC`,
			checkParams: func(t *testing.T, params map[string]any) {
				require.Equal(t, "test-chain", params["chain_id"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			sql, args, err := newQueryParser(tt.chainID).Parse(tt.query)

			if tt.expectedError != "" {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.expectedError)
				return
			}

			require.NoError(t, err)
			require.True(t, sqlMatches(t, tt.expectedSQL, sql))

			if tt.checkParams != nil {
				params := args.(map[string]any)
				tt.checkParams(t, params)
			}
		})
	}
}

func TestConvertToPostgresBitOffset(t *testing.T) {
	t.Parallel()

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
			t.Parallel()

			result := convertToPostgresBitOffset(tt.ourBit)
			require.Equal(t, tt.expectedPgBit, result, tt.description)
		})
	}
}

func TestBytesToBitString(t *testing.T) {
	t.Parallel()

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
			t.Parallel()

			result := parser.bytesToBitString(tt.value, tt.size)
			require.Equal(t, tt.expected, result)
		})
	}
}
