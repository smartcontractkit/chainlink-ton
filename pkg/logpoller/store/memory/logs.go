package inmemory

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

var _ logpoller.LogStore = (*inMemoryLogs)(nil)

// logKey represents a composite key for log deduplication
// using address + event signature + TxLT
type logKey struct {
	address  string // address string representation
	eventSig uint32 // event signature
	txLT     uint64 // transaction logical time
}

// inMemoryLogs is in-memory implementation of the LogStore interface.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this proper database-backed storage should be used.
type inMemoryLogs struct {
	mu      sync.Mutex
	logs    []models.Log
	logKeys map[logKey]bool // set of existing log keys for deduplication
	lggr    logger.Logger
	chainID string
}

func NewLogStore(chainID string, lggr logger.Logger) logpoller.LogStore {
	return &inMemoryLogs{
		lggr:    lggr,
		chainID: chainID,

		logs:    make([]models.Log, 0),
		logKeys: make(map[logKey]bool),
	}
}

func (s *inMemoryLogs) SaveLogs(ctx context.Context, logs []models.Log, batchInsertSize, minBatchSize uint32) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validate chainID for each log (same behavior as PostgreSQL store)
	for _, log := range logs {
		if log.ChainID != s.chainID {
			return 0, fmt.Errorf("invalid chainID in log got %s want %s", log.ChainID, s.chainID)
		}

		key := logKey{
			address:  log.Address.String(),
			eventSig: log.EventSig,
			txLT:     log.TxLT,
		}

		if s.logKeys[key] {
			continue
		}
		s.logs = append(s.logs, log)
		s.logKeys[key] = true
	}
	return int64(len(logs)), nil
}

// QueryLogs retrieves logs with TON-specific filtering capabilities including byte-level filtering,
// sorting, and pagination applied in-memory. This provides the same interface as the PostgreSQL store
// but implements filtering logic in-memory for test compatibility.
func (s *inMemoryLogs) QueryLogs(
	ctx context.Context,
	logQuery *query.LogQuery,
) (logs []models.Log, hasMore bool, nextCursor string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// apply all filters
	var filtered []models.Log
	for _, log := range s.logs {
		if s.applyFilters(log, logQuery) {
			filtered = append(filtered, log)
		}
	}

	// apply sorting
	s.applySorting(filtered, logQuery.LimitAndSort)

	// apply cursor filtering (after sorting for efficiency)
	if logQuery.LimitAndSort.HasCursorLimit() {
		filtered = s.applyCursorFilter(filtered, logQuery.LimitAndSort)
	}

	// apply limit
	requestedLimit := int(logQuery.LimitAndSort.Limit.Count) //nolint:gosec // limit values are reasonable for in-memory store
	if requestedLimit > 0 && len(filtered) > requestedLimit {
		hasMore = true
		filtered = filtered[:requestedLimit]
	}

	// generate next cursor if there are more results
	if hasMore && len(filtered) > 0 {
		lastLog := filtered[len(filtered)-1]
		nextCursor = query.FormatCursor(lastLog.Address, lastLog.MsgLT)
	}

	logs = filtered
	return
}

// applyFilters checks if a log passes all filters in the query
func (s *inMemoryLogs) applyFilters(log models.Log, logQuery *query.LogQuery) bool {
	if len(logQuery.ByteFilters) == 0 && len(logQuery.BitFilters) == 0 && len(logQuery.FieldFilters) == 0 {
		return true
	}

	// field filters (includes chain_id, address and event_sig filters from WithSource/WithEventSig)
	for _, filter := range logQuery.FieldFilters {
		if !s.matchFields(log, filter) {
			return false
		}
	}

	// byte filters (raw data filters)
	for _, filter := range logQuery.ByteFilters {
		if !s.matchBytes(log, filter) {
			return false
		}
	}

	// bit filters (raw data filters)
	for _, filter := range logQuery.BitFilters {
		if !s.matchBits(log, filter) {
			return false
		}
	}

	return true
}

var fieldExtractors = map[string]func(models.Log) any{
	"address":            func(l models.Log) any { return l.Address },
	"event_sig":          func(l models.Log) any { return l.EventSig },
	"tx_lt":              func(l models.Log) any { return l.TxLT },
	"tx_timestamp":       func(l models.Log) any { return l.TxTimestamp },
	"block_seqno":        func(l models.Log) any { return l.Block.SeqNo },
	"block_workchain":    func(l models.Log) any { return l.Block.Workchain },
	"block_shard":        func(l models.Log) any { return l.Block.Shard },
	"master_block_seqno": func(l models.Log) any { return l.MasterBlockSeqno },
	"msg_index":          func(l models.Log) any { return l.MsgIndex },
}

// matchFields checks if a log passes a root field filter
func (s *inMemoryLogs) matchFields(log models.Log, filter *query.FieldFilter) bool {
	extractor, ok := fieldExtractors[filter.Field]
	if !ok {
		return false
	}
	return s.compareValues(extractor(log), filter.Value, filter.Operator)
}

// compareValues compares two values using the specified operator
func (s *inMemoryLogs) compareValues(logValue, filterValue any, operator primitives.ComparisonOperator) bool {
	// Special handling for address equality (addresses are not orderable)
	if logAddr, ok := logValue.(*address.Address); ok {
		if filterAddr, ok := filterValue.(*address.Address); ok {
			switch operator {
			case primitives.Eq:
				return logAddr.Equals(filterAddr)
			case primitives.Neq:
				return !logAddr.Equals(filterAddr)
			default:
				return false // Addresses don't support ordering operators
			}
		}
		return false
	}

	cmp, ok := s.compareTypedValues(logValue, filterValue)
	if !ok {
		// fallback to simple equality for unsupported types
		switch operator {
		case primitives.Eq:
			return logValue == filterValue
		case primitives.Neq:
			return logValue != filterValue
		default:
			return false
		}
	}

	switch operator {
	case primitives.Eq:
		return cmp == 0
	case primitives.Neq:
		return cmp != 0
	case primitives.Gt:
		return cmp > 0
	case primitives.Gte:
		return cmp >= 0
	case primitives.Lt:
		return cmp < 0
	case primitives.Lte:
		return cmp <= 0
	default:
		return false
	}
}

// compareTypedValues performs type-safe comparison between two values
// Returns: -1 if a < b, 0 if a == b, 1 if a > b, or false if types don't match
func (s *inMemoryLogs) compareTypedValues(a, b any) (int, bool) {
	// Handle time.Time separately (not cmp.Ordered)
	if av, ok := a.(time.Time); ok {
		if bv, ok := b.(time.Time); ok {
			return cmp.Compare(av.Unix(), bv.Unix()), true
		}
		return 0, false
	}

	switch av := a.(type) {
	case uint64:
		if bv, ok := b.(uint64); ok {
			return cmp.Compare(av, bv), true
		}
	case uint32:
		if bv, ok := b.(uint32); ok {
			return cmp.Compare(av, bv), true
		}
	case int64:
		if bv, ok := b.(int64); ok {
			return cmp.Compare(av, bv), true
		}
	}
	return 0, false
}

// matchBytes checks if a log passes a single byte filter
func (s *inMemoryLogs) matchBytes(log models.Log, filter *query.ByteFilter) bool {
	// Extract cell payload as bytes for byte-level filtering
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false
	}

	// Check bounds
	if filter.Offset+filter.Size > uint64(len(cellPayload)) {
		return false
	}

	end := filter.Offset + filter.Size
	dataSlice := cellPayload[filter.Offset:end]

	for _, condition := range filter.Conditions {
		if !s.passesByteCondition(dataSlice, condition) {
			return false
		}
	}
	return true
}

// passesByteCondition checks if byte data passes a single condition
func (s *inMemoryLogs) passesByteCondition(data []byte, condition query.Condition) bool {
	switch condition.Operator {
	case primitives.Eq:
		return bytes.Equal(data, condition.Value)
	case primitives.Neq:
		return !bytes.Equal(data, condition.Value)
	case primitives.Gt:
		return bytes.Compare(data, condition.Value) > 0
	case primitives.Gte:
		return bytes.Compare(data, condition.Value) >= 0
	case primitives.Lt:
		return bytes.Compare(data, condition.Value) < 0
	case primitives.Lte:
		return bytes.Compare(data, condition.Value) <= 0
	default:
		return false
	}
}

// matchBits checks if a log passes a bit filter (single bit or bit range)
func (s *inMemoryLogs) matchBits(log models.Log, filter *query.BitFilter) bool {
	// Extract cell payload as bits using RestBits() for accurate bit-level processing
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false
	}

	// Extract the bit range as bytes
	extractedBytes, err := s.extractBitRange(cellPayload, filter.Offset, filter.Size)
	if err != nil {
		return false
	}

	// Apply all conditions
	for _, condition := range filter.Conditions {
		if !s.passesByteCondition(extractedBytes, condition) {
			return false
		}
	}

	return true
}

// extractBitRange extracts a bit range from cell payload and returns it as bytes.
// Uses math/big for cleaner and more reliable bit manipulation.
func (s *inMemoryLogs) extractBitRange(cellPayload []byte, startBit, bitLength uint64) ([]byte, error) {
	if bitLength == 0 {
		return []byte{}, nil
	}

	// Check bounds
	totalBits := uint64(len(cellPayload)) * 8
	if startBit >= totalBits || startBit+bitLength > totalBits {
		return nil, errors.New("bit range out of bounds")
	}

	// Convert entire byte slice to big.Int for bit manipulation
	payloadInt := new(big.Int).SetBytes(cellPayload)

	// Calculate shift amount to move desired bits to the rightmost position
	// In big-endian format, bit 0 is the leftmost (most significant) bit
	shiftAmount := totalBits - startBit - bitLength

	// Right-shift to move target bits to the rightmost position
	shifted := new(big.Int).Rsh(payloadInt, uint(shiftAmount))

	// Create mask to keep only the desired number of bits
	// mask = 2^bitLength - 1 (e.g., for 3 bits: 2^3 - 1 = 7 = 0b111)
	mask := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), uint(bitLength)), big.NewInt(1))

	// Apply mask to extract only the target bits
	resultInt := new(big.Int).And(shifted, mask)

	// Convert back to bytes
	resultBytes := resultInt.Bytes()

	// For single bit, ensure we return exactly one byte (0 or 1)
	if bitLength == 1 {
		if len(resultBytes) == 0 {
			return []byte{0}, nil
		}
		// Extract only the least significant bit
		return []byte{resultBytes[len(resultBytes)-1] & 1}, nil
	}

	// For bit ranges, pad with leading zeros if necessary to match expected byte length
	expectedByteLength := int64((bitLength + 7) / 8) //nolint:gosec // bitLength is controlled and reasonable for memory operations
	if int64(len(resultBytes)) < expectedByteLength {
		padded := make([]byte, expectedByteLength)
		copy(padded[expectedByteLength-int64(len(resultBytes)):], resultBytes)
		return padded, nil
	}

	return resultBytes, nil
}

// =============================================================================
// Sorting & Cursor Utilities
// =============================================================================

// applySorting applies sorting based on chainlink-common LimitAndSort
func (s *inMemoryLogs) applySorting(logs []models.Log, limitAndSort commonquery.LimitAndSort) {
	// Use default TxLT ascending sort if no sort criteria provided
	sortCriteria := limitAndSort.SortBy
	if len(sortCriteria) == 0 {
		sortCriteria = []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)}
	}

	sort.Slice(logs, func(i, j int) bool {
		for _, sortBy := range sortCriteria {
			var cmp int

			// Check if this is a field sorter
			if fieldSort, ok := sortBy.(*query.FieldSort); ok {
				cmp = fieldSort.Compare(logs[i], logs[j])

				if cmp != 0 {
					if fieldSort.GetDirection() == commonquery.Desc {
						return cmp > 0
					}
					return cmp < 0
				}
			}
		}
		return false
	})
}

// applyCursorFilter filters logs based on cursor position
func (s *inMemoryLogs) applyCursorFilter(logs []models.Log, limitAndSort commonquery.LimitAndSort) []models.Log {
	if !limitAndSort.HasCursorLimit() {
		return logs
	}

	addr, msgLT, err := query.ParseCursor(limitAndSort.Limit.Cursor)
	if err != nil || msgLT == 0 {
		return logs
	}

	var filtered []models.Log
	for _, log := range logs {
		var include bool

		if limitAndSort.Limit.CursorDirection == commonquery.CursorFollowing {
			include = s.compareLogToCursor(log, addr, msgLT) > 0
		} else {
			include = s.compareLogToCursor(log, addr, msgLT) < 0
		}

		if include {
			filtered = append(filtered, log)
		}
	}

	return filtered
}

func (s *inMemoryLogs) compareLogToCursor(log models.Log, cursorAddr *address.Address, cursorMsgLT uint64) int {
	addrCmp := strings.Compare(log.Address.String(), cursorAddr.String())
	if addrCmp != 0 {
		return addrCmp
	}

	if log.MsgLT < cursorMsgLT {
		return -1
	}
	if log.MsgLT > cursorMsgLT {
		return 1
	}

	return 0
}
