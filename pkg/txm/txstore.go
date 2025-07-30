package txm

import (
	"fmt"
	"sort"
	"sync"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"golang.org/x/exp/maps"
)

type UnconfirmedTx struct {
	LT           uint64
	ExpirationMs uint64
	Tx           *Tx
}

type FinalizedTx struct {
	ReceivedMessage tracetracking.ReceivedMessage
	ExitCode        tvm.ExitCode
	TraceSucceeded  bool
}

// TxStore tracks broadcast & unconfirmed txs per account address per chain id
type TxStore struct {
	lock sync.RWMutex

	unconfirmedTxs map[uint64]*UnconfirmedTx // broadcasted transactions awaiting trace finalization
	finalizedTxs   map[uint64]*FinalizedTx   // finalized and errored transactions held onto for status
}

func NewTxStore() *TxStore {
	return &TxStore{
		unconfirmedTxs: map[uint64]*UnconfirmedTx{},
		finalizedTxs:   map[uint64]*FinalizedTx{},
	}
}

// AddUnconfirmed adds a new unconfirmed transaction by lamport time.
func (s *TxStore) AddUnconfirmed(lt uint64, expirationMs uint64, tx *Tx) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	if _, exists := s.unconfirmedTxs[lt]; exists {
		return fmt.Errorf("tx already exists: %d", lt)
	}
	if _, exists := s.finalizedTxs[lt]; exists {
		return fmt.Errorf("tx already exists: %d", lt)
	}

	s.unconfirmedTxs[lt] = &UnconfirmedTx{
		LT:           lt,
		ExpirationMs: expirationMs,
		Tx:           tx,
	}

	return nil
}

// Confirm marks a transaction as confirmed and removes it by LT.
func (s *TxStore) MarkFinalized(lt uint64, success bool, exitCode tvm.ExitCode) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	unconfirmedTx, exists := s.unconfirmedTxs[lt]
	if !exists {
		return fmt.Errorf("no such unconfirmed tx: %d", lt)
	}
	if _, exists := s.finalizedTxs[lt]; exists {
		return fmt.Errorf("tx already finalized: %d", lt)
	}

	delete(s.unconfirmedTxs, lt)

	// move transaction to finalized map
	s.finalizedTxs[lt] = &FinalizedTx{
		ReceivedMessage: unconfirmedTx.Tx.ReceivedMessage,
		ExitCode:        exitCode,
		TraceSucceeded:  success,
	}

	return nil
}

// GetUnconfirmed returns all unconfirmed transactions sorted by expiration time ascending.
func (s *TxStore) GetUnconfirmed() []*UnconfirmedTx {
	s.lock.RLock()
	defer s.lock.RUnlock()

	unconfirmed := maps.Values(s.unconfirmedTxs)

	sort.Slice(unconfirmed, func(i, j int) bool {
		return unconfirmed[i].ExpirationMs < unconfirmed[j].ExpirationMs
	})

	return unconfirmed
}

func (s *TxStore) InflightCount() int {
	s.lock.RLock()
	defer s.lock.RUnlock()
	return len(s.unconfirmedTxs)
}

// GetTxState returns the message status, whether the transaction trace succeeded,
// the exit code, and whether the transaction was found at all.
// - MsgStatus indicates the lifecycle state of the message.
// - isSucceeded indicates whether the transaction trace execution succeeded.
// - ExitCode contains the VM result code.
// - Coins represents the Total Action Fees associated with the transaction.
// - found tells whether the transaction was present in memory.
func (s *TxStore) GetTxState(lt uint64) (tracetracking.MsgStatus, bool, tvm.ExitCode, tlb.Coins, bool) {
	s.lock.RLock()
	defer s.lock.RUnlock()

	if _, exists := s.unconfirmedTxs[lt]; exists {
		// Transaction is seen but not finalized
		return tracetracking.Cascading, false, 0, tlb.ZeroCoins, true
	}

	if tx, exists := s.finalizedTxs[lt]; exists {
		// Transaction is finalized (success or failure is indicated separately)
		totalActionFees := tlb.MustFromNano(tx.ReceivedMessage.TotalActionFees, 9)
		return tracetracking.Finalized, tx.TraceSucceeded, tx.ExitCode, totalActionFees, true
	}

	// Transaction not found in any store
	return tracetracking.NotFound, false, 0, tlb.ZeroCoins, false
}

type AccountStore struct {
	store map[string]*TxStore // map account address to txstore
	lock  sync.RWMutex
}

func NewAccountStore() *AccountStore {
	return &AccountStore{
		store: map[string]*TxStore{},
	}
}

// GetTxStore returns the TxStore for an account, creating it if missing.
func (c *AccountStore) GetTxStore(accountAddress string) *TxStore {
	c.lock.Lock()
	defer c.lock.Unlock()

	store, exists := c.store[accountAddress]
	if !exists {
		store = NewTxStore()
		c.store[accountAddress] = store
	}
	return store
}

// GetTotalInflightCount returns the total count of unconfirmed txs across all accounts.
func (c *AccountStore) GetTotalInflightCount() int {
	c.lock.RLock()
	defer c.lock.RUnlock()

	count := 0
	for _, store := range c.store {
		count += store.InflightCount()
	}
	return count
}

// GetAllUnconfirmed returns a map from account address to their list of unconfirmed transactions.
func (c *AccountStore) GetAllUnconfirmed() map[string][]*UnconfirmedTx {
	c.lock.RLock()
	defer c.lock.RUnlock()

	allUnconfirmed := map[string][]*UnconfirmedTx{}
	for account, store := range c.store {
		allUnconfirmed[account] = store.GetUnconfirmed()
	}
	return allUnconfirmed
}
