package inmemorystore

import (
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

var _ logpoller.LogStore = (*inMemoryStore)(nil)

// inMemoryStore is a temporary in-memory implementation for TON CCIP MVP.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this should be replaced with proper database-backed storage.
//
// TODO(NONEVM-2187): implement ORM using a database for persistence in production
type inMemoryStore struct {
	lggr            logger.SugaredLogger
	cellQueryEngine *CellQueryEngine
	mu              sync.Mutex
	logs            []types.Log
}

func NewLogStore(lggr logger.Logger) *inMemoryStore {
	return &inMemoryStore{
		lggr:            logger.Sugared(lggr),
		cellQueryEngine: NewCellQueryEngine(lggr),
	}
}

func (s *inMemoryStore) SaveLog(log types.Log) {
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
func (s *inMemoryStore) FilteredLogs(
	evtSrcAddress string,
	topic uint32,
	filters []cellquery.CellQuery,
	options cellquery.QueryOptions,
) (cellquery.QueryResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var matchingLogs []types.Log

	for i, log := range s.logs {
		// match by address and topic (would be indexed query in DB)
		if log.EventTopic != topic || log.Address.String() != evtSrcAddress {
			continue
		}

		// extract cell payload for filtering
		cellPayload, err := s.cellQueryEngine.ExtractCellPayload(log.Data, i)
		if err != nil {
			return cellquery.QueryResult{}, fmt.Errorf("failed to parse log at index %d: %w", i, err)
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

func (s *inMemoryStore) FilteredLogsWithParser(
	evtSrcAddress string,
	topic uint32,
	parser types.LogParser,
	filter types.LogFilter,
) ([]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	results := make([]any, 0, len(s.logs))
	for i, log := range s.logs {
		if log.EventTopic != topic || log.Address.String() != evtSrcAddress {
			continue
		}

		c, err := cell.FromBOC(log.Data)
		if err != nil {
			s.lggr.Warnw("Failed to decode log data from BoC", "index", i, "err", err)
			continue
		}

		parsedEvent, err := parser(c)
		if err != nil {
			s.lggr.Warnw("Parser failed to process log data", "index", i, "err", err)
			continue
		}

		if filter != nil && !filter(parsedEvent) {
			continue
		}

		results = append(results, parsedEvent)
	}

	return results, nil
}
