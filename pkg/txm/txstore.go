package txm

import (
	"fmt"
	"sort"
	"sync"

	"golang.org/x/exp/maps"
)

type UnconfirmedTx struct {
	LT           uint64
	ExpirationMs uint64
	Tx           *TONTx
}

// TxStore tracks broadcast & unconfirmed txs per account address per chain id
type TxStore struct {
	lock sync.RWMutex

	unconfirmedTxes map[uint64]*UnconfirmedTx
}

func NewTxStore() *TxStore {
	return &TxStore{
		unconfirmedTxes: map[uint64]*UnconfirmedTx{},
	}
}

// AddUnconfirmed adds a new unconfirmed transaction by lamport time.
func (s *TxStore) AddUnconfirmed(lt uint64, expirationMs uint64, tx *TONTx) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	if _, exists := s.unconfirmedTxes[lt]; exists {
		return fmt.Errorf("hash already exists: %d", lt)
	}

	s.unconfirmedTxes[lt] = &UnconfirmedTx{
		LT:           lt,
		ExpirationMs: expirationMs,
		Tx:           tx,
	}

	return nil
}

// Confirm marks a transaction as confirmed and removes it by LT.
func (s *TxStore) Confirm(lt uint64) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	if _, exists := s.unconfirmedTxes[lt]; !exists {
		return fmt.Errorf("no such unconfirmed hash: %d", lt)
	}

	delete(s.unconfirmedTxes, lt)
	return nil
}

// GetUnconfirmed returns all unconfirmed transactions sorted by expiration time ascending.
func (s *TxStore) GetUnconfirmed() []*UnconfirmedTx {
	s.lock.RLock()
	defer s.lock.RUnlock()

	unconfirmed := maps.Values(s.unconfirmedTxes)

	sort.Slice(unconfirmed, func(i, j int) bool {
		return unconfirmed[i].ExpirationMs < unconfirmed[j].ExpirationMs
	})

	return unconfirmed
}

func (s *TxStore) InflightCount() int {
	s.lock.RLock()
	defer s.lock.RUnlock()
	return len(s.unconfirmedTxes)
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
