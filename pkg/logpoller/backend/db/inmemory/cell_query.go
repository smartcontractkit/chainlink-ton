package inmemory

import (
	"bytes"
	"fmt"
	"sort"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

// CellQueryEngine provides direct byte-level queries for TON cell (BOC) data.
// This implementation is specifically for CCIP TON accessor and does NOT support
// full DSL (Domain Specific Language) capabilities - only direct byte comparisons
// at specified offsets within the cell payload.
//
// TODO: with SQL we might need to implement a more efficient way to query logs
// TODO: (NONEVM-2187) - investigate optimizations for large-scale log querying

type CellQueryEngine struct {
	lggr logger.SugaredLogger
}

func NewCellQueryEngine(lggr logger.Logger) *CellQueryEngine {
	return &CellQueryEngine{
		lggr: logger.Sugared(lggr),
	}
}

func (f *CellQueryEngine) PassesAllQueries(payload []byte, queries []cellquery.CellQuery, logIndex int) (bool, error) {
	for j, query := range queries {
		f.lggr.Tracef("  Applying query #%d: Offset=%d, Op='%s', Value=%x",
			j, query.Offset, query.Operator, query.Value)

		// check payload length
		if uint(len(payload)) < query.Offset+uint(len(query.Value)) {
			f.lggr.Tracef("    Query #%d FAILED: payload too short (len: %d)", j, len(payload))
			return false, nil
		}

		// extract and compare data slice
		end := query.Offset + uint(len(query.Value))
		if end > uint(len(payload)) {
			f.lggr.Tracef("    Query #%d FAILED: offset + value length exceeds payload length", j)
			return false, nil
		}

		dataSlice := payload[query.Offset:end]
		f.lggr.Tracef("    Extracted dataSlice: %x", dataSlice)

		match, err := f.compareBytes(dataSlice, query.Value, query.Operator)
		if err != nil {
			return false, fmt.Errorf("query #%d comparison failed for log #%d: %w", j, logIndex, err)
		}

		f.lggr.Tracef("    Query match: %t", match)

		if !match {
			f.lggr.Tracef("  Query #%d did not match. Skipping log #%d", j, logIndex)
			return false, nil
		}
	}
	return true, nil // all queries passed.
}

func (f *CellQueryEngine) compareBytes(dataSlice, queryValue []byte, operator cellquery.Operator) (bool, error) {
	comparison := bytes.Compare(dataSlice, queryValue)

	switch operator {
	case cellquery.EQ:
		return comparison == 0, nil
	case cellquery.NEQ:
		return comparison != 0, nil
	case cellquery.GT:
		return comparison > 0, nil
	case cellquery.GTE:
		return comparison >= 0, nil
	case cellquery.LT:
		return comparison < 0, nil
	case cellquery.LTE:
		return comparison <= 0, nil
	default:
		return false, fmt.Errorf("unsupported operator: %s", operator)
	}
}

func (f *CellQueryEngine) ApplySorting(logs []types.Log, sortBy []cellquery.SortBy) {
	if len(sortBy) == 0 {
		return
	}

	sort.Slice(logs, func(i, j int) bool {
		for _, sortCriteria := range sortBy {
			var cmp int

			if sortCriteria.Field == cellquery.SortByTxLT {
				if logs[i].TxLT < logs[j].TxLT {
					cmp = -1
				} else if logs[i].TxLT > logs[j].TxLT {
					cmp = 1
				}
			}

			if cmp != 0 {
				if sortCriteria.Order == cellquery.DESC {
					return cmp > 0
				}
				return cmp < 0
			}
		}
		return false
	})
}

func (f *CellQueryEngine) ApplyPagination(logs []types.Log, limit, offset int) cellquery.QueryResult {
	totalCount := len(logs)

	if offset >= totalCount {
		return cellquery.QueryResult{
			Logs:    []types.Log{},
			HasMore: false,
			Total:   totalCount,
		}
	}

	start := offset
	end := totalCount

	if limit > 0 && start+limit < totalCount {
		end = start + limit
	}

	return cellquery.QueryResult{
		Logs:    logs[start:end],
		HasMore: end < totalCount,
		Total:   totalCount,
	}
}
