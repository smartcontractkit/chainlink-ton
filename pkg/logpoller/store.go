package logpoller

import (
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// InMemoryStore is a temporary in-memory implementation for TON CCIP MVP.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this should be replaced with proper database-backed storage.
//
// TODO(NONEVM-2187): implement ORM using a database for persistence in production
type InMemoryStore struct {
	lggr            logger.SugaredLogger
	cellQueryEngine *CellQueryEngine
	mu              sync.Mutex
	logs            []types.Log
}

func NewInMemoryStore(lggr logger.Logger) *InMemoryStore {
	return &InMemoryStore{
		lggr:            logger.Sugared(lggr),
		cellQueryEngine: NewCellQueryEngine(lggr),
	}
}

func (s *InMemoryStore) SaveLog(log types.Log) {
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

func (s *InMemoryStore) GetLogs(evtSrcAddress string) []types.Log {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []types.Log
	for _, log := range s.logs {
		if log.Address.String() == evtSrcAddress {
			out = append(out, log)
		}
	}
	return out
}

// GetLogsByTopicWithFilter finds logs by address and topic, then applies cell-level filters.
func (s *InMemoryStore) GetLogsByTopicWithFilter(
	evtSrcAddress string,
	topic uint32,
	filters []CellQuery,
	options QueryOptions,
) (QueryResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.lggr.Debugf("GetLogsByTopicWithFilter called. Total logs: %d, Address: %s, Topic: %d",
		len(s.logs), evtSrcAddress, topic)

	var matchingLogs []types.Log

	for i, log := range s.logs {
		// match by address and topic (would be indexed query in DB)
		if log.EventTopic != topic || log.Address.String() != evtSrcAddress {
			continue
		}

		// extract cell payload for filtering
		cellPayload, err := s.cellQueryEngine.ExtractCellPayload(log.Data, i)
		if err != nil {
			continue // Error already logged
		}

		// apply all cell filters
		if s.cellQueryEngine.PassesAllQueries(cellPayload, filters, i) {
			matchingLogs = append(matchingLogs, log)
		}
	}

	s.cellQueryEngine.ApplySorting(matchingLogs, options.SortBy)
	return s.cellQueryEngine.ApplyPagination(matchingLogs, options.Limit, options.Offset), nil
}

func (s *InMemoryStore) FilteredParsedLogs(
	evtSrcAddress string,
	topic uint32,
	parser func(cell *cell.Cell) (any, error),
	filter func(parsedEvent any) bool,
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
