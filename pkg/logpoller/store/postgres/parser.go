package postgres

import (
	"fmt"
	"strings"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

// TON_BOC_HEADER_SIZE is the number of bytes to skip when accessing raw BOC data
// to align PostgreSQL store behavior with Memory store behavior.
// Memory store uses BeginParse().RestBits() which extracts cell payload only,
// while PostgreSQL stores the full BOC data including header.
// This value was determined through empirical testing and is consistent across
// different TON cell structures.
const TonBocHeaderSize = 13

// queryParser helps build SQL queries with named parameters for TON log retrieval
type queryParser struct {
	query         strings.Builder
	params        map[string]any // All parameters in one map - simpler!
	byteFilterIdx int            // Counter for byte filter parameters
	chainID       string         // Chain ID for shared database scenarios
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
		data, 
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
	if !strings.Contains(p.query.String(), "WHERE") {
		p.query.WriteString(" WHERE ")
	} else {
		p.query.WriteString(" AND ")
	}
	p.query.WriteString(condition)
}

// addByteFilter adds WHERE conditions for a single byte filter
func (p *queryParser) addByteFilter(filter *query.ByteFilter) error {
	for _, condition := range filter.Conditions {
		// Apply BOC header offset to align PostgreSQL with Memory store behavior
		// Memory store uses log.Data.BeginParse().RestBits() which extracts cell payload only,
		// while PostgreSQL stores the full BOC data including header.
		// Convert 0-based offset to 1-based for SQL SUBSTRING, plus BOC header offset
		sqlOffset := int(filter.Offset) + 1 + TonBocHeaderSize //nolint:gosec // byte filter offsets are small values
		sqlSize := int(filter.Size)                            //nolint:gosec // byte filter sizes are small values

		operatorSQL, err := buildOperator(condition.Operator)
		if err != nil {
			return fmt.Errorf("invalid operator in byte filter: %w", err)
		}

		// Generate unique parameter name for this byte filter
		paramName := fmt.Sprintf("byte_value_%d", p.byteFilterIdx)
		p.byteFilterIdx++
		p.params[paramName] = condition.Value

		conditionSQL := fmt.Sprintf("SUBSTRING(data, %d, %d) %s :%s",
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
	p.params[paramName] = f.Value

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

	p.params["cursor_address"] = addr.String()
	p.params["cursor_msg_lt"] = fmt.Sprintf("%d", msgLT)

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

// buildOperator returns the SQL operator string for a condition operator.
func buildOperator(operator primitives.ComparisonOperator) (string, error) {
	switch operator {
	case primitives.Eq:
		return "=", nil
	case primitives.Neq:
		return "!=", nil
	case primitives.Gt:
		return ">", nil
	case primitives.Gte:
		return ">=", nil
	case primitives.Lt:
		return "<", nil
	case primitives.Lte:
		return "<=", nil
	default:
		return "", fmt.Errorf("unsupported comparison operator: %v", operator)
	}
}

// addBitFilter adds WHERE conditions for bit filters using PostgreSQL bit functions
func (p *queryParser) addBitFilter(f *query.BitFilter) error {
	// Apply BOC header offset to align PostgreSQL with Memory store behavior
	adjustedStartBit := f.Offset + uint64(TonBocHeaderSize*8)

	for _, condition := range f.Conditions {
		conditionSQL, err := p.buildBitConditionSQL(adjustedStartBit, f.Size, condition)
		if err != nil {
			return err
		}
		p.addCondition(conditionSQL)
	}
	return nil
}

// buildBitConditionSQL creates optimized SQL for bit filtering using consistent get_bit() approach
func (p *queryParser) buildBitConditionSQL(offset, size uint64, condition query.Condition) (string, error) {
	// Convert operator to SQL
	operatorSQL, err := buildOperator(condition.Operator)
	if err != nil {
		return "", err
	}

	if size == 1 {
		// Single bit case: use get_bit() directly
		expectedValue := int(condition.Value[0])
		return fmt.Sprintf("get_bit(data, %d) %s %d", offset, operatorSQL, expectedValue), nil
	}

	// Multi-bit case: build bit string comparison using get_bit() concatenation
	// This creates SQL like: (get_bit(data, 160) || get_bit(data, 161) || ... || get_bit(data, 167)) = B'10101010'

	// Convert byte value to bit string literal
	bitString := p.bytesToBitString(condition.Value, size)

	// Build concatenated get_bit() expression
	var bitExpressions []string
	for i := uint64(0); i < size; i++ {
		bitExpressions = append(bitExpressions, fmt.Sprintf("get_bit(data, %d)", offset+i))
	}

	concatenatedBits := strings.Join(bitExpressions, " || ")
	return fmt.Sprintf("(%s) %s B'%s'", concatenatedBits, operatorSQL, bitString), nil
}

// bytesToBitString converts byte slice to PostgreSQL bit string literal format
func (p *queryParser) bytesToBitString(value []byte, size uint64) string {
	var bits strings.Builder

	bitsProcessed := uint64(0)
	for _, byteVal := range value {
		for bitPos := 7; bitPos >= 0 && bitsProcessed < size; bitPos-- {
			if (byteVal>>bitPos)&1 == 1 {
				bits.WriteByte('1')
			} else {
				bits.WriteByte('0')
			}
			bitsProcessed++
		}
		if bitsProcessed >= size {
			break
		}
	}

	return bits.String()
}
