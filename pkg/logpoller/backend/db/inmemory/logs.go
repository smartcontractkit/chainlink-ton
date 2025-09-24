package inmemory

import (
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.LogStore = (*inMemoryLogs)(nil)

// TODO(@jadepark-dev): TON Accessor tend to call Replay multiple times on Sync, so dedup logic is implemented here
// logKey represents a composite key for log deduplication
// using address + event signature + TxLT
type logKey struct {
	address  string // address string representation
	eventSig uint32 // event signature
	txLT     uint64 // transaction logical time
}

// String returns a string representation of the log key
func (k logKey) String() string {
	return fmt.Sprintf("%s-%d-%d", k.address, k.eventSig, k.txLT)
}

// inMemoryLogs is a temporary in-memory implementation for TON CCIP MVP.
// This provides basic log storage and querying capabilities without database persistence.
// For production use, this should be replaced with proper database-backed storage.
//
// TODO(NONEVM-2187): implement ORM and remove in-memory store
type inMemoryLogs struct {
	mu      sync.Mutex
	logs    []types.Log
	logKeys map[logKey]bool // set of existing log keys for deduplication
	lggr    logger.SugaredLogger
}

// NewLogStore creates a new log store with a logger
func NewLogStore(lggr logger.Logger) logpoller.LogStore {
	return &inMemoryLogs{
		logs:    make([]types.Log, 0),
		logKeys: make(map[logKey]bool),
		lggr:    logger.Sugared(lggr),
	}
}

func (s *inMemoryLogs) SaveLog(log types.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Create composite key for deduplication
	key := logKey{
		address:  log.Address.String(),
		eventSig: log.EventSig,
		txLT:     log.TxLT,
	}

	// Check if log already exists
	if s.logKeys[key] {
		s.lggr.Debugw("duplicate log detected, skipping save",
			"address", log.Address.String(),
			"eventSig", log.EventSig,
			"txLT", log.TxLT,
			"key", key.String())
		return
	}

	// Save the log and mark key as used
	s.logs = append(s.logs, log)
	s.logKeys[key] = true

	// Debug log showing current store size
	s.lggr.Debugw("saved log to store",
		"address", log.Address.String(),
		"eventSig", log.EventSig,
		"txLT", log.TxLT,
		"totalLogsInStore", len(s.logs))
}

// GetLogs retrieves raw logs for a given address and event signature without any parsing or filtering.
// This method returns the raw logs for further processing by higher-level components(QueryBuilder).
func (s *inMemoryLogs) GetLogs(srcAddr *address.Address, sig uint32) ([]types.Log, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var res []types.Log
	for _, log := range s.logs {
		if log.EventSig == sig && log.Address.Equals(srcAddr) {
			res = append(res, log)
		}
	}

	return res, nil
}
