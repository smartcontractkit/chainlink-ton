package cellquery

import "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"

// CellQuery defines a query for direct byte-level filtering on a log's data.
// This is part of the public API for advanced filtering.
type CellQuery struct {
	Offset   uint
	Operator Operator // e.g., "=", "!=", ">", "<"
	Value    []byte
}

// QueryOptions specifies pagination and sorting for log queries.
type QueryOptions struct {
	Limit  int
	Offset int
	SortBy []SortBy
}

// QueryResult holds the result of a log query.
type QueryResult struct {
	Logs    []types.Log
	HasMore bool
	Total   int
}

type Operator string

const (
	EQ  Operator = "="
	NEQ Operator = "!="
	GT  Operator = ">"
	GTE Operator = ">="
	LT  Operator = "<"
	LTE Operator = "<="
)

type SortField string
type SortOrder string

const (
	SortByTxLT SortField = "tx_lt"

	ASC  SortOrder = "ASC"
	DESC SortOrder = "DESC"
)

type SortBy struct {
	Field SortField
	Order SortOrder
}
