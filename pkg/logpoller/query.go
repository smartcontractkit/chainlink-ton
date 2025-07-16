package logpoller

import (
	"bytes"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// CellQueryEngine provides direct byte-level queries for TON cell (BOC) data.
// This implementation is specifically for CCIP TON accessor and does NOT support
// full DSL (Domain Specific Language) capabilities - only direct byte comparisons
// at specified offsets within the cell payload.
//
// TODO: with SQL we might need to implement a more efficient way to query logs
// TODO: (NONEVM-2187) - investigate optimizations for large-scale log querying

type Operator string

const (
	EQ  Operator = "="
	NEQ Operator = "!="
	GT  Operator = ">"
	GTE Operator = ">="
	LT  Operator = "<"
	LTE Operator = "<="
)

type CellQuery struct {
	Offset   uint     // offset is the byte offset within the log's Data field to start the comparison.
	Operator Operator // operator is the comparison operator to use.
	Value    []byte   // value is the byte slice to compare against. The length of the slice determines how many bytes are read from the Data field starting at the offset.
}

type CellQueryEngine struct {
	lggr logger.SugaredLogger
}

func NewCellQueryEngine(lggr logger.Logger) *CellQueryEngine {
	return &CellQueryEngine{
		lggr: logger.Sugared(lggr),
	}
}

func (f *CellQueryEngine) ExtractCellPayload(logData []byte, logIndex int) ([]byte, error) {
	parsedCell, err := cell.FromBOC(logData)
	if err != nil {
		f.lggr.Tracef("FAILED to parse BOC for log #%d: %v. Skipping", logIndex, err)
		return nil, err
	}
	// this returns the payload of the cell, after header and other metadata
	_, cellPayload, err := parsedCell.BeginParse().RestBits()
	if err != nil {
		f.lggr.Tracef("FAILED to get cell payload for log #%d: %v. Skipping", logIndex, err)
		return nil, err
	}

	return cellPayload, nil
}

func (f *CellQueryEngine) PassesAllQueries(payload []byte, queries []CellQuery, logIndex int) bool {
	for j, query := range queries {
		f.lggr.Tracef("  Applying query #%d: Offset=%d, Op='%s', Value=%x",
			j, query.Offset, query.Operator, query.Value)

		// check payload length
		if uint(len(payload)) < query.Offset+uint(len(query.Value)) {
			f.lggr.Tracef("    Query #%d FAILED: payload too short (len: %d)", j, len(payload))
			return false
		}

		// extract and compare data slice
		end := query.Offset + uint(len(query.Value))
		if end > uint(len(payload)) {
			f.lggr.Tracef("    Query #%d FAILED: offset + value length exceeds payload length", j)
			return false
		}

		dataSlice := payload[query.Offset:end]
		f.lggr.Tracef("    Extracted dataSlice: %x", dataSlice)

		match, err := f.compareBytes(dataSlice, query.Value, query.Operator)
		if err != nil {
			f.lggr.Errorf("Query comparison failed: %v", err)
			return false
		}

		f.lggr.Tracef("    Query match: %t", match)

		if !match {
			f.lggr.Tracef("  Query #%d did not match. Skipping log #%d", j, logIndex)
			return false
		}
	}
	return true
}

func (f *CellQueryEngine) compareBytes(dataSlice, queryValue []byte, operator Operator) (bool, error) {
	comparison := bytes.Compare(dataSlice, queryValue)

	switch operator {
	case EQ:
		return comparison == 0, nil
	case NEQ:
		return comparison != 0, nil
	case GT:
		return comparison > 0, nil
	case GTE:
		return comparison >= 0, nil
	case LT:
		return comparison < 0, nil
	case LTE:
		return comparison <= 0, nil
	default:
		return false, fmt.Errorf("unsupported operator: %s", operator)
	}
}
