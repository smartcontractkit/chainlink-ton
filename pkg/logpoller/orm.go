package logpoller

import (
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// TODO: build as orm, for the first iteration we can directly read logs in memory
type InMemoryStore struct {
	mu   sync.Mutex
	logs []types.Log
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{}
}

func (s *InMemoryStore) SaveLog(log types.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	log.ReceivedAt = now
	if log.ExpiresAt == nil && log.ReceivedAt != (time.Time{}) {
		// TODO: use configurable retention period
		// TODO: there is no expiration logic in memory store currently
		exp := now.Add(24 * time.Hour)
		log.ExpiresAt = &exp
	}
	s.logs = append(s.logs, log)
}

func (s *InMemoryStore) GetLogs() []types.Log {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]types.Log, len(s.logs))
	copy(out, s.logs)
	return out
}

// TODO: Access Layer unlikely to know the registered filter ID,
// TODO: Name is more suitable since it's known to the protocol
// TODO: Or even better, event topic is enough to identify the logs(orm shouldn't know about filters)
// TODO: Topic should be available with Event gobindings, so we can use it to filter logs
// TODO: However, is filter - result match guaranteed?

func (s *InMemoryStore) GetLogsByTopic(evtSrcAddress string, topic uint64, limit int) ([]types.Log, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []types.Log
	for _, log := range s.logs {
		if log.EventTopic == topic && log.Address.String() == evtSrcAddress {
			out = append(out, log)
		}
	}
	if limit > 0 && len(out) > limit {
		return out[:limit], nil
	}
	return out, nil
}
