package postgres

import (
	"encoding/binary"
	"fmt"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/boc"
)

const (
	sqlArrayIndexOffset = 1 // SQL uses 1-based indexing for array indices
)

// queryParser helps build SQL queries with named parameters for TON log retrieval
type queryParser struct {
	query         strings.Builder // parsed SQL result
	params        map[string]any  // all query parameters
	byteFilterIdx int             // counter for byte filter parameters
	chainID       string          // Chain ID for shared database scenarios
	hasWhere      bool
}

// newQueryParser creates a new SQL query parser for TON logs
func newQueryParser(chainID string) *queryParser {
	builder := &queryParser{
		params:  make(map[string]any),
		chainID: chainID,
	}

	builder.query.WriteString(`SELECT 
		id, 
		filter_id, 
		chain_id, 
		address, 
		event_sig, 
		data_header,
		data_payload,
		tx_hash, 
		tx_lt, 
		msg_index, 
		tx_timestamp, 
		block_workchain, 
		block_shard, 
		block_seqno, 
		block_root_hash, 
		block_file_hash, 
		master_block_seqno, 
		msg_lt,
		created_at
	FROM ton.log_poller_logs`)
	return builder
}

// Parse is the main entry point for building log queries
func (p *queryParser) Parse(q *query.LogQuery) (sql string, params any, err error) {
	// Add chainID filter first for shared database scenarios
	if err := p.addFieldFilter(&query.FieldFilter{
		Field:    "chain_id",
		Operator: primitives.Eq,
		Value:    p.chainID,
	}); err != nil {
		return "", nil, fmt.Errorf("failed to add chain_id filter: %w", err)
	}

	// Add field filters (any additional filters)
	for _, filter := range q.FieldFilters {
		if err := p.addFieldFilter(filter); err != nil {
			return "", nil, fmt.Errorf("failed to add field filter: %w", err)
		}
	}

	for _, filter := range q.ByteFilters {
		if err := p.addByteFilter(filter); err != nil {
			return "", nil, fmt.Errorf("failed to add byte filter: %w", err)
		}
	}

	for _, filter := range q.BitFilters {
		if err := p.addBitFilter(filter); err != nil {
			return "", nil, fmt.Errorf("failed to add bit filter: %w", err)
		}
	}

	// add cursor filter for pagination
	if err := p.addCursorFilter(q.LimitAndSort); err != nil {
		return "", nil, fmt.Errorf("failed to add cursor filter: %w", err)
	}

	p.addOrderBy(q.LimitAndSort)
	p.addLimit(q.LimitAndSort)

	// build returns the final SQL query and parameters
	return p.query.String(), p.params, nil
}

// addCondition adds a condition to the query (WHERE for first, AND for subsequent)
func (p *queryParser) addCondition(condition string) {
	if !p.hasWhere {
		p.query.WriteString(" WHERE ")
		p.hasWhere = true
	} else {
		p.query.WriteString(" AND ")
	}
	p.query.WriteString(condition)
}

// addByteFilter adds WHERE conditions for a single byte filter
func (p *queryParser) addByteFilter(filter *query.ByteFilter) error {
	for _, condition := range filter.Conditions {
		// Query operates on data_payload which starts with 2-byte cell descriptor
		// Cell data starts at byte 2, so: offset + 1 (SQL 1-based) + 2 (descriptor)
		sqlOffset := int(filter.Offset) + sqlArrayIndexOffset + boc.CellDescriptorSize //nolint:gosec // byte filter offsets are small values
		sqlSize := int(filter.Size)                                                    //nolint:gosec // byte filter sizes are small values

		operatorSQL, err := buildOperator(condition.Operator)
		if err != nil {
			return fmt.Errorf("invalid operator in byte filter: %w", err)
		}

		// Generate unique parameter name for this byte filter
		paramName := fmt.Sprintf("byte_value_%d", p.byteFilterIdx)
		p.byteFilterIdx++
		p.params[paramName] = condition.Value

		conditionSQL := fmt.Sprintf("SUBSTRING(data_payload, %d, %d) %s :%s",
			sqlOffset, sqlSize, operatorSQL, paramName)
		p.addCondition(conditionSQL)
	}
	return nil
}

// addFieldFilter adds WHERE conditions for root field filtering
func (p *queryParser) addFieldFilter(f *query.FieldFilter) error {
	operatorSQL, err := buildOperator(f.Operator)
	if err != nil {
		return fmt.Errorf("invalid operator in root field filter: %w", err)
	}

	paramName := f.Field
	paramValue := f.Value

	// Special handling for address: convert to raw bytes for DB
	if f.Field == "address" {
		if addr, ok := f.Value.(*address.Address); ok {
			rawAddr := codec.ToRawAddr(addr)
			paramValue = rawAddr[:]
		}
	}

	// Special handling for event_sig: convert uint32 to []byte
	if f.Field == "event_sig" {
		if eventSig, ok := f.Value.(uint32); ok {
			eventSigBytes := make([]byte, 4)
			binary.BigEndian.PutUint32(eventSigBytes, eventSig)
			paramValue = eventSigBytes
		}
	}

	p.params[paramName] = paramValue

	conditionSQL := fmt.Sprintf("%s %s :%s", f.Field, operatorSQL, paramName)
	p.addCondition(conditionSQL)
	return nil
}

// addCursorFilter adds the WHERE clause for cursor-based pagination
func (p *queryParser) addCursorFilter(limitAndSort commonquery.LimitAndSort) error {
	if !limitAndSort.HasCursorLimit() {
		return nil
	}

	addr, msgLT, err := query.ParseCursor(limitAndSort.Limit.Cursor)
	if err != nil {
		return fmt.Errorf("invalid cursor format: %w", err)
	}

	if msgLT == 0 {
		return nil
	}

	var cursorOp string
	switch limitAndSort.Limit.CursorDirection {
	case commonquery.CursorPrevious:
		cursorOp = "<"
	default:
		cursorOp = ">"
	}

	rawAddr := codec.ToRawAddr(addr)
	p.params["cursor_address"] = rawAddr[:]
	p.params["cursor_msg_lt"] = strconv.FormatUint(msgLT, 10)

	cursorCondition := fmt.Sprintf("(address, msg_lt) %s (:cursor_address, :cursor_msg_lt)", cursorOp)
	p.addCondition(cursorCondition)

	return nil
}

// addOrderBy constructs the ORDER BY clause, including default sorting and tie-breakers
func (p *queryParser) addOrderBy(limitAndSort commonquery.LimitAndSort) {
	var orderParts []string

	for _, sort := range limitAndSort.SortBy {
		if fieldSort, ok := sort.(*query.FieldSort); ok {
			direction := "ASC"
			if fieldSort.GetDirection() == commonquery.Desc {
				direction = "DESC"
			}
			orderParts = append(orderParts, fmt.Sprintf("%s %s", fieldSort.GetField(), direction))
		}
	}

	if len(orderParts) == 0 {
		orderParts = append(orderParts, "address ASC", "msg_lt ASC")
	}

	p.query.WriteString(" ORDER BY ")
	p.query.WriteString(strings.Join(orderParts, ", "))
}

// addLimit constructs the LIMIT clause
func (p *queryParser) addLimit(limitAndSort commonquery.LimitAndSort) {
	if limitAndSort.Limit.Count > 0 {
		// Add +1 to detect if there are more results for pagination
		p.query.WriteString(fmt.Sprintf(" LIMIT %d", limitAndSort.Limit.Count+1))
	}
}

var operatorMap = map[primitives.ComparisonOperator]string{
	primitives.Eq:  "=",
	primitives.Neq: "!=",
	primitives.Gt:  ">",
	primitives.Gte: ">=",
	primitives.Lt:  "<",
	primitives.Lte: "<=",
}

// buildOperator returns the SQL operator string for a condition operator.
func buildOperator(operator primitives.ComparisonOperator) (string, error) {
	if sql, ok := operatorMap[operator]; ok {
		return sql, nil
	}
	return "", fmt.Errorf("unsupported comparison operator: %v", operator)
}

// TODO(@jadepark-dev): need to test performance of this approach.
// addBitFilter adds WHERE conditions for bit filters using PostgreSQL bit functions
func (p *queryParser) addBitFilter(f *query.BitFilter) error {
	for _, condition := range f.Conditions {
		conditionSQL, err := p.buildBitConditionSQL(f.Offset, f.Size, condition)
		if err != nil {
			return err
		}
		p.addCondition(conditionSQL)
	}
	return nil
}

// convertToPostgresBitOffset converts our bit numbering to PostgreSQL BYTEA's bit numbering.
// PostgreSQL BYTEA: bit 0 = rightmost bit of byte 0(LSB), see https://www.postgresql.org/docs/16/functions-binarystring.html
// Examples:
//
//	convertToPostgresBitOffset(0) = 7  // First bit of first byte
//	convertToPostgresBitOffset(7) = 0  // Last bit of first byte
//	convertToPostgresBitOffset(8) = 15 // First bit of second byte
func convertToPostgresBitOffset(bit uint64) uint64 {
	byteIndex := bit / 8
	bitInByte := bit % 8
	return byteIndex*8 + (7 - bitInByte)
}

// buildBitConditionSQL creates optimized SQL for bit filtering using consistent get_bit() approach
// offset is in our bit numbering system (relative to cell data, after 2-byte descriptor)
func (p *queryParser) buildBitConditionSQL(offset, size uint64, condition query.Condition) (string, error) {
	operatorSQL, err := buildOperator(condition.Operator)
	if err != nil {
		return "", err
	}

	// Only support equality for bit filtering (other operators don't make sense for bit-by-bit comparison)
	if operatorSQL != "=" {
		return "", fmt.Errorf("bit comparison only supports equality, got: %s", operatorSQL)
	}

	// Build each bit comparison as AND conditions
	conditions := make([]string, size)

	if size == 1 {
		// Single bit: Value[0] is the bit value directly (0 or 1)
		adjustedBit := offset + uint64(boc.CellDescriptorSize*8)
		pgBit := convertToPostgresBitOffset(adjustedBit)
		expectedBit := int(condition.Value[0])
		conditions[0] = fmt.Sprintf("get_bit(data_payload, %d) = %d", pgBit, expectedBit)
	} else {
		// Multi-bit: Value is a byte array, convert to bit string
		bitString := p.bytesToBitString(condition.Value, size)
		for i := uint64(0); i < size; i++ {
			adjustedBit := (offset + i) + uint64(boc.CellDescriptorSize*8)
			pgBit := convertToPostgresBitOffset(adjustedBit)
			expectedBit := bitString[i] - '0' // Convert '0' or '1' char to 0 or 1 int
			conditions[i] = fmt.Sprintf("get_bit(data_payload, %d) = %d", pgBit, expectedBit)
		}
	}

	return "(" + strings.Join(conditions, " AND ") + ")", nil
}

// bytesToBitString converts byte slice to bit string for multi-bit comparison.
func (p *queryParser) bytesToBitString(value []byte, size uint64) string {
	var bits strings.Builder
	bits.Grow(int(size)) //nolint:gosec // safe to grow buffer since size is controlled

	bitsProcessed := uint64(0)
	for _, byteVal := range value {
		// format byte as 8-bit binary string (e.g. 0x86 → "10000110")
		byteBits := fmt.Sprintf("%08b", byteVal)

		// append only the bits we need
		remaining := size - bitsProcessed
		if remaining < 8 {
			bits.WriteString(byteBits[:remaining])
			break
		}
		bits.WriteString(byteBits)
		bitsProcessed += 8
	}

	return bits.String()
}
