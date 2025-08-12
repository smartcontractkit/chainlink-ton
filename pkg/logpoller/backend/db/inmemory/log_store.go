package inmemory

import (
	"fmt"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

var _ logpoller.LogStore = (*inMemoryLogStore)(nil)

// inMemoryLogStore is a temporary in-memory implementation for TON CCIP MVP.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this should be replaced with proper database-backed storage.
//
// TODO(NONEVM-2187): implement ORM using a database for persistence in production
type inMemoryLogStore struct {
	lggr            logger.SugaredLogger
	cellQueryEngine *CellQueryEngine
	mu              sync.Mutex
	logs            []types.Log
}

func NewLogStore(lggr logger.Logger) logpoller.LogStore {
	return &inMemoryLogStore{
		lggr:            logger.Sugared(lggr),
		cellQueryEngine: NewCellQueryEngine(lggr),
	}
}

func (s *inMemoryLogStore) SaveLog(log types.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if log.ExpiresAt == nil {
		// TODO: use configurable retention period
		// TODO: there is no expiration logic in memory store currently
		exp := now.Add(24 * time.Hour)
		log.ExpiresAt = &exp
	}
	s.logs = append(s.logs, log)
}

// FilteredLogs finds logs by address and topic, then applies cell-level filters.
func (s *inMemoryLogStore) FilteredLogs(
	evtSrcAddress *address.Address,
	topic uint32,
	filters []cellquery.CellQuery,
	options cellquery.QueryOptions,
) (cellquery.QueryResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var matchingLogs []types.Log

	for i, log := range s.logs {
		// match by address and topic (would be indexed query in DB)
		if log.EventTopic != topic || !log.Address.Equals(evtSrcAddress) {
			continue
		}

		_, cellPayload, err := log.Data.BeginParse().RestBits()
		if err != nil {
			return cellquery.QueryResult{}, fmt.Errorf("could not extract payload from cell for log #%d: %w", i, err)
		}

		// apply all cell filters
		passes, err := s.cellQueryEngine.PassesAllQueries(cellPayload, filters, i)
		if err != nil {
			return cellquery.QueryResult{}, fmt.Errorf("failed to apply filter to log at index %d: %w", i, err)
		}

		if passes {
			matchingLogs = append(matchingLogs, log)
		}
	}

	s.cellQueryEngine.ApplySorting(matchingLogs, options.SortBy)
	return s.cellQueryEngine.ApplyPagination(matchingLogs, options.Limit, options.Offset), nil
}

// GetLogs retrieves raw logs for a given address and topic without any parsing or filtering.
// This method returns the raw logs for further processing by higher-level components.
func (s *inMemoryLogStore) GetLogs(evtSrcAddress *address.Address, topic uint32) ([]types.Log, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var res []types.Log
	for _, log := range s.logs {
		if log.EventTopic == topic && log.Address.Equals(evtSrcAddress) {
			res = append(res, log)
		}
	}

	return res, nil
}
