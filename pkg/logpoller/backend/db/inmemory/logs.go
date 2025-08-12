package inmemory

import (
	"sync"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.LogStore = (*inMemoryLogs)(nil)

// inMemoryLogs is a temporary in-memory implementation for TON CCIP MVP.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this should be replaced with proper database-backed storage.
//
// TODO(NONEVM-2187): implement ORM and remove in-memory store
type inMemoryLogs struct {
	mu   sync.Mutex
	logs []types.Log
}

func NewLogStore() logpoller.LogStore {
	return &inMemoryLogs{}
}

func (s *inMemoryLogs) SaveLog(log types.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = append(s.logs, log)
}

// GetLogs retrieves raw logs for a given address and topic without any parsing or filtering.
// This method returns the raw logs for further processing by higher-level components(LogQuery).
func (s *inMemoryLogs) GetLogs(srcAddr *address.Address, topic uint32) ([]types.Log, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var res []types.Log
	for _, log := range s.logs {
		if log.EventSig == topic && log.Address.Equals(srcAddr) {
			res = append(res, log)
		}
	}

	return res, nil
}
