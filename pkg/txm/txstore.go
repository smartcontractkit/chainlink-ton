package txm

import (
	"fmt"
	"sort"
	"sync"

	"golang.org/x/exp/maps"
)

type UnconfirmedTx struct {
	Hash         string
	ExpirationMs int64
	Tx           *TONTx
}

// TxStore tracks broadcast & unconfirmed txs per account address per chain id
type TxStore struct {
	lock sync.RWMutex

	unconfirmedTxes map[string]*UnconfirmedTx
}

func NewTxStore() *TxStore {
	return &TxStore{
		unconfirmedTxes: map[string]*UnconfirmedTx{},
	}
}

func (s *TxStore) AddUnconfirmed(hash string, expirationMs int64, tx *TONTx) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	if _, exists := s.unconfirmedTxes[hash]; exists {
		return fmt.Errorf("hash already exists: %s", hash)
	}

	s.unconfirmedTxes[hash] = &UnconfirmedTx{
		Hash:         hash,
		ExpirationMs: expirationMs,
		Tx:           tx,
	}

	return nil
}

func (s *TxStore) Confirm(hash string) error {
	s.lock.Lock()
	defer s.lock.Unlock()

	if _, exists := s.unconfirmedTxes[hash]; !exists {
		return fmt.Errorf("no such unconfirmed hash: %s", hash)
	}
	delete(s.unconfirmedTxes, hash)
	return nil
}

func (s *TxStore) GetUnconfirmed() []*UnconfirmedTx {
	s.lock.RLock()
	defer s.lock.RUnlock()

	unconfirmed := maps.Values(s.unconfirmedTxes)

	sort.Slice(unconfirmed, func(i, j int) bool {
		a := unconfirmed[i]
		b := unconfirmed[j]
		return a.ExpirationMs < b.ExpirationMs
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

func (c *AccountStore) GetTxStore(fromAddress string) *TxStore {
	c.lock.Lock()
	defer c.lock.Unlock()
	store, ok := c.store[fromAddress]
	if !ok {
		store = NewTxStore()
		c.store[fromAddress] = store
	}
	return store
}

func (c *AccountStore) GetTotalInflightCount() int {
	// use read lock for methods that read underlying data
	c.lock.RLock()
	defer c.lock.RUnlock()

	count := 0
	for _, store := range c.store {
		count += store.InflightCount()
	}

	return count
}

func (c *AccountStore) GetAllUnconfirmed() map[string][]*UnconfirmedTx {
	// use read lock for methods that read underlying data
	c.lock.RLock()
	defer c.lock.RUnlock()

	allUnconfirmed := map[string][]*UnconfirmedTx{}
	for fromAddressStr, store := range c.store {
		allUnconfirmed[fromAddressStr] = store.GetUnconfirmed()
	}
	return allUnconfirmed
}
