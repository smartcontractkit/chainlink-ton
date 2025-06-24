package logpoller

import (
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type InMemoryStore struct {
	mu              sync.Mutex
	lastSeq         uint32
	contractCursors map[string]uint64
	logs            []types.Log
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		contractCursors: make(map[string]uint64),
	}
}

func (s *InMemoryStore) LoadLastSeq() uint32 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastSeq
}

func (s *InMemoryStore) SaveLastSeq(seq uint32) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastSeq = seq
}

func (s *InMemoryStore) SaveLog(log types.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	log.ReceivedAt = now
	if log.ExpiresAt == nil && log.ReceivedAt != (time.Time{}) {
		// TODO: use configurable retention period
		exp := now.Add(24 * time.Hour)
		log.ExpiresAt = &exp
	}
	s.logs = append(s.logs, log)
}

func (s *InMemoryStore) ListLogs() []types.Log {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]types.Log, len(s.logs))
	copy(out, s.logs)
	return out
}
