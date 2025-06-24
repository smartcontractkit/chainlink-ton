// logpoller/store.go
package logpoller

import (
	"sync"
)

// InMemoryStore implements StateStore + event capture in one.
type InMemoryStore struct {
	mu              sync.Mutex
	lastSeq         uint32
	contractCursors map[string]uint64
	events          []Event
}

// NewInMemoryStore builds a fresh store.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		contractCursors: make(map[string]uint64),
		events:          make([]Event, 0),
	}
}

// LoadLastSeq returns the last processed masterchain seq.
func (s *InMemoryStore) LoadLastSeq() (uint32, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastSeq, nil
}

// SaveLastSeq persists the highest masterchain seq processed.
func (s *InMemoryStore) SaveLastSeq(seq uint32) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastSeq = seq
	return nil
}

// LoadContractCursor returns the last LT cursor for a given contract.
func (s *InMemoryStore) LoadContractCursor(addr string) (uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.contractCursors[addr], nil
}

// SaveContractCursor updates the LT cursor for a contract.
func (s *InMemoryStore) SaveContractCursor(addr string, cursor uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.contractCursors[addr] = cursor
	return nil
}

// SaveEvent appends a processed Event to the in‐memory log.
func (s *InMemoryStore) SaveEvent(ev Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, ev)
}

// ListEvents returns a snapshot of all recorded Events.
func (s *InMemoryStore) ListEvents() []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}
