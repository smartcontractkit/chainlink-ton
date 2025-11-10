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
				Value:    addr.String(),
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

	// Check parameters
	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
	require.Equal(t, "EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF", params["address"])

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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	},
	)

	require.NoError(t, err)

	// Check exact SQL with cursor condition (PostgreSQL tuple comparison)
	expectedSQL := `SELECT id, filter_id, chain_id, address, event_sig, data_header, data_payload, tx_hash, tx_lt, msg_index, tx_timestamp, block_workchain, block_shard, block_seqno, block_root_hash, block_file_hash, master_block_seqno, msg_lt, created_at FROM ton.log_poller_logs WHERE chain_id = :chain_id AND address = :address AND event_sig = :event_sig AND (address, msg_lt) > (:cursor_address, :cursor_msg_lt) ORDER BY address ASC, msg_lt ASC LIMIT 6`
	require.True(t, sqlMatches(t, expectedSQL, sql))

	// Check parameters include cursor values
	params := args.(map[string]any)
	require.Equal(t, "test-chain", params["chain_id"])
	require.Equal(t, "EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF", params["cursor_address"])
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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
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
			{Field: "address", Operator: primitives.Eq, Value: addr.String()},
			{Field: "event_sig", Operator: primitives.Eq, Value: uint32(123)},
		},
		LimitAndSort: limitAndSort,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to add cursor filter")
}
