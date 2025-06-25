package logpoller

import (
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// TODO: refactor as orm, for the first iteration we can directly read logs in memory
type InMemoryStore struct {
	mu              sync.Mutex
	logs            []types.Log
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
