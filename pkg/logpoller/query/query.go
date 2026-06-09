package query

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// LogQuery represents a complete query structure that can be passed to stores
type LogQuery struct {
	FieldFilters []*FieldFilter
	ByteFilters  []*ByteFilter
	BitFilters   []*BitFilter
	LimitAndSort commonquery.LimitAndSort
}

// FieldFilter represents a filter on a root-level field (e.g., tx_timestamp, tx_lt).
// This type is exported for store implementations but should not be used directly by users.
// Use helper functions like Timestamp() instead.
type FieldFilter struct {
	Field    string
	Operator primitives.ComparisonOperator
	Value    any
}

// ByteFilter represents a filter that operates on raw byte data within a log's cell.
// It filters by extracting a slice of bytes at a specific offset and applying conditions.
type ByteFilter struct {
	Offset     uint64
	Size       uint64
	Conditions []Condition
}

// BitFilter represents a filter that operates on bit-level data within a log's cell.
// It can handle both single bits and bit ranges.
type BitFilter struct {
	Offset     uint64
	Size       uint64
	Conditions []Condition
}

// TODO(@jadepark-dev): probably we can merge this with normal field filter
// Condition represents a single comparison to be applied to a slice of bytes.
type Condition struct {
	Operator primitives.ComparisonOperator
	Value    []byte
}

// WithCondition creates a Condition for byte comparison with the given operator.
func WithCondition(value []byte, op primitives.ComparisonOperator) Condition {
	return Condition{
		Operator: op,
		Value:    value,
	}
}

// Timestamp creates a FieldFilter for the tx_timestamp field.
func Timestamp(ts time.Time, op primitives.ComparisonOperator) *FieldFilter {
	return &FieldFilter{
		Field:    "tx_timestamp",
		Operator: op,
		Value:    ts,
	}
}

// Sorting helper functions

// FieldSort provides a flexible way to sort by any database field.
// The comparison logic is provided at construction time, eliminating runtime switching.
type FieldSort struct {
	field     string
	direction commonquery.SortDirection
	compareFn func(log1, log2 models.Log) int
}

// GetDirection returns the sort direction for this field sort.
func (s *FieldSort) GetDirection() commonquery.SortDirection {
	return s.direction
}

// GetField returns the field name for this sort.
func (s *FieldSort) GetField() string {
	return s.field
}

// Compare compares two logs using the pre-configured comparison function.
// Returns negative if log1 < log2, zero if log1 == log2, positive if log1 > log2.
func (s *FieldSort) Compare(log1, log2 models.Log) int {
	return s.compareFn(log1, log2)
}

// NewTxLTSort creates a sort by transaction logical time (tx_lt).
func NewTxLTSort(direction commonquery.SortDirection) commonquery.SortBy {
	return &FieldSort{
		field:     "tx_lt",
		direction: direction,
		compareFn: func(log1, log2 models.Log) int {
			if log1.TxLT < log2.TxLT {
				return -1
			}
			if log1.TxLT > log2.TxLT {
				return 1
			}
			// If tx_lt is the same, compare by message_index for deterministic ordering
			if log1.MsgIndex < log2.MsgIndex {
				return -1
			}
			if log1.MsgIndex > log2.MsgIndex {
				return 1
			}
			return 0
		},
	}
}

// NewTimestampSort creates a sort by transaction timestamp.
func NewTimestampSort(direction commonquery.SortDirection) commonquery.SortBy {
	return &FieldSort{
		field:     "tx_timestamp",
		direction: direction,
		compareFn: func(log1, log2 models.Log) int {
			if log1.TxTimestamp.Before(log2.TxTimestamp) {
				return -1
			}
			if log1.TxTimestamp.After(log2.TxTimestamp) {
				return 1
			}
			// If timestamps are the same, use tx_lt for deterministic ordering
			if log1.TxLT < log2.TxLT {
				return -1
			}
			if log1.TxLT > log2.TxLT {
				return 1
			}
			// If both timestamp and tx_lt are the same, use message_index
			if log1.MsgIndex < log2.MsgIndex {
				return -1
			}
			if log1.MsgIndex > log2.MsgIndex {
				return 1
			}
			return 0
		},
	}
}

func FormatCursor(addr *address.Address, msgLT uint64) string {
	return fmt.Sprintf("%s:%d", addr.String(), msgLT)
}

// ParseCursor parses a cursor string into its components: address, msgLT.
func ParseCursor(cursor string) (addr *address.Address, msgLT uint64, err error) {
	if cursor == "" {
		return nil, 0, errors.New("cursor is empty")
	}

	// Find the last colon separator to handle addresses that may contain special characters
	lastColon := strings.LastIndex(cursor, ":")
	if lastColon == -1 {
		return nil, 0, errors.New("invalid cursor format: missing ':' separator")
	}

	addrStr := cursor[:lastColon]
	msgLTStr := cursor[lastColon+1:]

	addr, err = address.ParseAddr(addrStr)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid address in cursor: %w", err)
	}

	msgLT, err = strconv.ParseUint(msgLTStr, 10, 64)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid msgLT in cursor: %w", err)
	}

	return addr, msgLT, nil
}

// DecodedLogs is a package-level helper that decodes raw logs into typed events using TLB.
// This is a convenience function for clients that want TLB parsing without coupling the logpoller to business logic.
//
// Note: this is post-processing helper after store-level query, this affects performance since it's in-memory operation
// we may consider creating TypedQueryBuilder that will return TypedLog instead of Log, but that abstracts out the in-memory operation
// which should be visible from client, so here chosen option is: client is responsible to decode and filter the logs in memory
func DecodedLogs[T any](logs []models.Log) ([]models.TypedLog[T], error) {
	typedLogs := make([]models.TypedLog[T], 0, len(logs))

	for _, log := range logs {
		var event T
		// Always skip magic (opcode in msg) when parsing log cells, we only store message body
		const skipMagic = true
		if parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse(), skipMagic); parseErr != nil {
			// Return error when parsing fails - clients can decide how to handle
			return nil, fmt.Errorf("failed to decode log at tx %s: %w", hex.EncodeToString(log.TxHash[:]), parseErr)
		}

		typedLogs = append(typedLogs, models.TypedLog[T]{
			Log:       log,
			TypedData: event,
		})
	}

	return typedLogs, nil
}

// DecodedLogsWithFilter is a package-level helper that decodes and filters raw logs using TLB.
// This combines decoding with application-level filtering for convenience.
func DecodedLogsWithFilter[T any](logs []models.Log, filter func(T) bool) ([]models.TypedLog[T], error) {
	// First decode all events
	typedLogs, err := DecodedLogs[T](logs)
	if err != nil {
		return nil, err
	}

	// Then apply the filter
	filtered := make([]models.TypedLog[T], 0, len(typedLogs))
	for _, log := range typedLogs {
		if filter(log.TypedData) {
			filtered = append(filtered, log)
		}
	}

	return filtered, nil
}
