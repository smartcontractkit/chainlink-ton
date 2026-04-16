package txm

import (
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	testAddr1 = "EQD__________________________________________0vo"
	testAddr2 = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"
)

func TestTxStore_AddUnconfirmed(t *testing.T) {
	store := NewTxStore()

	t.Run("adds new unconfirmed transaction", func(t *testing.T) {
		tx := &Tx{
			From:   *address.MustParseAddr(testAddr1),
			To:     *address.MustParseAddr(testAddr2),
			Amount: tlb.MustFromTON("1.0"),
		}

		err := store.AddUnconfirmed(12345, 1000000, tx)
		require.NoError(t, err)

		unconfirmed := store.GetUnconfirmed()
		require.Len(t, unconfirmed, 1)
		assert.Equal(t, uint64(12345), unconfirmed[0].LT)
		assert.Equal(t, uint64(1000000), unconfirmed[0].ExpirationMs)
		assert.Equal(t, tx, unconfirmed[0].Tx)
	})

	t.Run("returns error when adding duplicate LT to unconfirmed", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{
			From:   *address.MustParseAddr(testAddr1),
			To:     *address.MustParseAddr(testAddr2),
			Amount: tlb.MustFromTON("1.0"),
		}

		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)

		err = store.AddUnconfirmed(sampleLT, 2000000, tx)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "tx already exists")
	})

	t.Run("returns error when adding LT that exists in finalized", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{
			From:   *address.MustParseAddr(testAddr1),
			To:     *address.MustParseAddr(testAddr2),
			Amount: tlb.MustFromTON("1.0"),
		}

		// Add and finalize
		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)
		err = store.MarkFinalized(sampleLT, true, 0)
		require.NoError(t, err)

		// Try to add again
		err = store.AddUnconfirmed(sampleLT, 2000000, tx)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "tx already exists")
	})
}

func TestTxStore_MarkFinalized(t *testing.T) {
	t.Run("marks unconfirmed transaction as finalized", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{
			From:   *address.MustParseAddr(testAddr1),
			To:     *address.MustParseAddr(testAddr2),
			Amount: tlb.MustFromTON("1.0"),
			ReceivedMessage: tracetracking.ReceivedMessage{
				TotalActionFees: big.NewInt(1000000),
			},
		}

		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)

		err = store.MarkFinalized(sampleLT, true, tvm.ExitCodeSuccess)
		require.NoError(t, err)

		// Should be removed from unconfirmed
		assert.Empty(t, store.GetUnconfirmed())

		// Should be in finalized
		status, succeeded, exitCode, _, found := store.GetTxState(sampleLT)
		require.True(t, found)
		assert.Equal(t, tracetracking.Finalized, status)
		assert.True(t, succeeded)
		assert.Equal(t, tvm.ExitCodeSuccess, exitCode)
	})

	t.Run("returns error when marking non-existent transaction", func(t *testing.T) {
		store := NewTxStore()

		err := store.MarkFinalized(99999, true, 0)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no such unconfirmed tx")
	})

	t.Run("returns error when marking already finalized transaction", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{
			From:   *address.MustParseAddr(testAddr1),
			To:     *address.MustParseAddr(testAddr2),
			Amount: tlb.MustFromTON("1.0"),
		}

		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)

		err = store.MarkFinalized(sampleLT, true, 0)
		require.NoError(t, err)

		// Trying to mark again will fail because it's no longer in unconfirmed
		err = store.MarkFinalized(sampleLT, false, 1)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no such unconfirmed tx")
	})
}

func TestTxStore_GetUnconfirmed(t *testing.T) {
	t.Run("returns transactions sorted by expiration time", func(t *testing.T) {
		store := NewTxStore()
		tx1 := &Tx{From: *address.MustParseAddr(testAddr1)}
		tx2 := &Tx{From: *address.MustParseAddr(testAddr1)}
		tx3 := &Tx{From: *address.MustParseAddr(testAddr1)}

		// Add in non-sorted order
		err := store.AddUnconfirmed(100, 3000000, tx3)
		require.NoError(t, err)
		err = store.AddUnconfirmed(101, 1000000, tx1)
		require.NoError(t, err)
		err = store.AddUnconfirmed(102, 2000000, tx2)
		require.NoError(t, err)

		unconfirmed := store.GetUnconfirmed()
		require.Len(t, unconfirmed, 3)

		// Should be sorted by expiration time ascending
		assert.Equal(t, uint64(1000000), unconfirmed[0].ExpirationMs)
		assert.Equal(t, uint64(2000000), unconfirmed[1].ExpirationMs)
		assert.Equal(t, uint64(3000000), unconfirmed[2].ExpirationMs)
	})

	t.Run("returns empty slice when no unconfirmed transactions", func(t *testing.T) {
		store := NewTxStore()
		unconfirmed := store.GetUnconfirmed()
		assert.Empty(t, unconfirmed)
	})
}

func TestTxStore_GetTxState(t *testing.T) {
	t.Run("returns cascading status for unconfirmed transaction", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{From: *address.MustParseAddr(testAddr1)}

		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)

		status, succeeded, exitCode, fees, found := store.GetTxState(sampleLT)
		assert.True(t, found)
		assert.Equal(t, tracetracking.Cascading, status)
		assert.False(t, succeeded)
		assert.Equal(t, tvm.ExitCode(0), exitCode)
		assert.Equal(t, tlb.ZeroCoins, fees)
	})

	t.Run("returns finalized status for finalized transaction", func(t *testing.T) {
		store := NewTxStore()
		sampleLT := uint64(12345)
		tx := &Tx{
			From: *address.MustParseAddr(testAddr1),
			ReceivedMessage: tracetracking.ReceivedMessage{
				TotalActionFees: big.NewInt(5000000),
			},
		}

		err := store.AddUnconfirmed(sampleLT, 1000000, tx)
		require.NoError(t, err)
		err = store.MarkFinalized(sampleLT, true, tvm.ExitCodeSuccess)
		require.NoError(t, err)

		status, succeeded, exitCode, fees, found := store.GetTxState(sampleLT)
		assert.True(t, found)
		assert.Equal(t, tracetracking.Finalized, status)
		assert.True(t, succeeded)
		assert.Equal(t, tvm.ExitCodeSuccess, exitCode)
		assert.Equal(t, "0.005", fees.String())
	})

	t.Run("returns not found for non-existent transaction", func(t *testing.T) {
		store := NewTxStore()

		status, succeeded, exitCode, fees, found := store.GetTxState(99999)
		assert.False(t, found)
		assert.Equal(t, tracetracking.NotFound, status)
		assert.False(t, succeeded)
		assert.Equal(t, tvm.ExitCode(0), exitCode)
		assert.Equal(t, tlb.ZeroCoins, fees)
	})
}

func TestTxStore_CleanupFinalizedAndExpired(t *testing.T) {
	t.Run("removes all finalized transactions", func(t *testing.T) {
		store := NewTxStore()

		// Add and finalize multiple transactions
		for i := range 5 {
			tx := &Tx{
				From: *address.MustParseAddr(testAddr1),
				ReceivedMessage: tracetracking.ReceivedMessage{
					TotalActionFees: big.NewInt(1000000),
				},
			}
			lt := uint64(1000 + i)
			err := store.AddUnconfirmed(lt, 2000000, tx)
			require.NoError(t, err)
			err = store.MarkFinalized(lt, true, tvm.ExitCodeSuccess)
			require.NoError(t, err)
		}

		// Verify all are present and finalized
		for i := range 5 {
			lt := uint64(1000 + i)
			status, succeeded, _, _, found := store.GetTxState(lt)
			assert.Equal(t, tracetracking.Finalized, status)
			assert.True(t, succeeded)
			assert.True(t, found)
		}

		// Cleanup
		finalizedTxs := store.cleanupFinalized()

		assert.Len(t, finalizedTxs, 5)

		// Verify all finalized transactions are removed
		for i := range 5 {
			lt := uint64(1000 + i)
			_, _, _, _, found := store.GetTxState(lt)
			assert.False(t, found)
		}
	})

	t.Run("removes expired unconfirmed transactions", func(t *testing.T) {
		store := NewTxStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		// Add transactions with various expiration times
		tx1 := &Tx{From: *address.MustParseAddr(testAddr1)}
		tx2 := &Tx{From: *address.MustParseAddr(testAddr1)}
		tx3 := &Tx{From: *address.MustParseAddr(testAddr1)}
		tx4 := &Tx{From: *address.MustParseAddr(testAddr1)}

		// Expired transactions
		err := store.AddUnconfirmed(1001, currentTimeMs-10000, tx1)
		require.NoError(t, err)
		err = store.AddUnconfirmed(1002, currentTimeMs-5000, tx2)
		require.NoError(t, err)

		// Non-expired transactions
		err = store.AddUnconfirmed(1003, currentTimeMs+10000, tx3)
		require.NoError(t, err)
		err = store.AddUnconfirmed(1004, currentTimeMs+20000, tx4)
		require.NoError(t, err)

		// Cleanup
		expiredTxs := store.cleanupExpired(currentTimeMs)

		assert.Len(t, expiredTxs, 2)

		// Verify expired transactions are removed
		_, _, _, _, found := store.GetTxState(1001)
		assert.False(t, found)
		_, _, _, _, found = store.GetTxState(1002)
		assert.False(t, found)

		// Verify non-expired transactions remain
		_, _, _, _, found = store.GetTxState(1003)
		assert.True(t, found)
		_, _, _, _, found = store.GetTxState(1004)
		assert.True(t, found)
	})

	t.Run("removes both finalized and expired transactions", func(t *testing.T) {
		store := NewTxStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		// Add finalized transactions
		for i := range 3 {
			tx := &Tx{
				From: *address.MustParseAddr(testAddr1),
				ReceivedMessage: tracetracking.ReceivedMessage{
					TotalActionFees: big.NewInt(1000000),
				},
			}
			lt := uint64(2000 + i)
			err := store.AddUnconfirmed(lt, currentTimeMs+10000, tx)
			require.NoError(t, err)
			err = store.MarkFinalized(lt, true, tvm.ExitCodeSuccess)
			require.NoError(t, err)
		}

		// Add expired unconfirmed transactions
		for i := range 2 {
			tx := &Tx{From: *address.MustParseAddr(testAddr1)}
			lt := uint64(3000 + i)
			err := store.AddUnconfirmed(lt, currentTimeMs-10000, tx)
			require.NoError(t, err)
		}

		// Add non-expired unconfirmed transactions
		tx := &Tx{From: *address.MustParseAddr(testAddr1)}
		err := store.AddUnconfirmed(4000, currentTimeMs+10000, tx)
		require.NoError(t, err)

		// Cleanup
		finalized := store.cleanupFinalized()
		expired := store.cleanupExpired(currentTimeMs)

		assert.Len(t, finalized, 3)
		assert.Len(t, expired, 2)

		// Verify finalized transactions are removed
		for i := range 3 {
			lt := uint64(2000 + i)
			_, _, _, _, found := store.GetTxState(lt)
			assert.False(t, found)
		}

		// Verify expired unconfirmed transactions are removed
		for i := range 2 {
			lt := uint64(3000 + i)
			_, _, _, _, found := store.GetTxState(lt)
			assert.False(t, found)
		}

		// Verify non-expired unconfirmed transaction remains
		_, _, _, _, found := store.GetTxState(4000)
		assert.True(t, found)
	})

	t.Run("handles cleanup with no transactions", func(t *testing.T) {
		store := NewTxStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		finalized := store.cleanupFinalized()
		expired := store.cleanupExpired(currentTimeMs)

		assert.Empty(t, finalized)
		assert.Empty(t, expired)
	})

	t.Run("handles cleanup with only non-expired transactions", func(t *testing.T) {
		store := NewTxStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		// Add only non-expired transactions
		for i := range 3 {
			tx := &Tx{From: *address.MustParseAddr(testAddr1)}
			lt := uint64(5000 + i)
			err := store.AddUnconfirmed(lt, currentTimeMs+10000, tx)
			require.NoError(t, err)
		}

		finalized := store.cleanupFinalized()
		expired := store.cleanupExpired(currentTimeMs)

		assert.Empty(t, finalized)
		assert.Empty(t, expired)

		// Verify all transactions remain
		for i := range 3 {
			lt := uint64(5000 + i)
			_, _, _, _, found := store.GetTxState(lt)
			assert.True(t, found)
		}
	})
}

func TestAccountStore_GetTxStore(t *testing.T) {
	t.Run("creates new TxStore for new account", func(t *testing.T) {
		accountStore := NewAccountStore()

		store := accountStore.GetTxStore(testAddr1)
		require.NotNil(t, store)
		assert.Equal(t, 0, store.InflightCount())
	})

	t.Run("returns existing TxStore for existing account", func(t *testing.T) {
		accountStore := NewAccountStore()

		store1 := accountStore.GetTxStore(testAddr1)
		tx := &Tx{From: *address.MustParseAddr(testAddr1)}
		err := store1.AddUnconfirmed(12345, 1000000, tx)
		require.NoError(t, err)

		store2 := accountStore.GetTxStore(testAddr1)
		assert.Equal(t, store1, store2)
		assert.Equal(t, 1, store2.InflightCount())
	})
}

func TestAccountStore_GetTotalInflightCount(t *testing.T) {
	t.Run("returns total count across all accounts", func(t *testing.T) {
		accountStore := NewAccountStore()

		store1 := accountStore.GetTxStore(testAddr1)
		store2 := accountStore.GetTxStore(testAddr2)

		// Add transactions to first account
		for i := range 3 {
			tx := &Tx{From: *address.MustParseAddr(testAddr1)}
			err := store1.AddUnconfirmed(uint64(1000+i), 2000000, tx)
			require.NoError(t, err)
		}

		// Add transactions to second account
		for i := range 2 {
			tx := &Tx{From: *address.MustParseAddr(testAddr2)}
			err := store2.AddUnconfirmed(uint64(2000+i), 2000000, tx)
			require.NoError(t, err)
		}

		assert.Equal(t, 5, accountStore.GetTotalInflightCount())
	})

	t.Run("returns zero when no accounts have transactions", func(t *testing.T) {
		accountStore := NewAccountStore()
		assert.Equal(t, 0, accountStore.GetTotalInflightCount())
	})
}

func TestAccountStore_GetAllUnconfirmed(t *testing.T) {
	t.Run("returns unconfirmed transactions for all accounts", func(t *testing.T) {
		accountStore := NewAccountStore()

		store1 := accountStore.GetTxStore(testAddr1)
		store2 := accountStore.GetTxStore(testAddr2)

		// Add transactions
		tx1 := &Tx{From: *address.MustParseAddr(testAddr1)}
		err := store1.AddUnconfirmed(1001, 2000000, tx1)
		require.NoError(t, err)

		tx2 := &Tx{From: *address.MustParseAddr(testAddr2)}
		err = store2.AddUnconfirmed(2001, 3000000, tx2)
		require.NoError(t, err)

		allUnconfirmed := accountStore.GetAllUnconfirmed()

		require.Len(t, allUnconfirmed, 2)
		assert.Len(t, allUnconfirmed[testAddr1], 1)
		assert.Len(t, allUnconfirmed[testAddr2], 1)
		assert.Equal(t, uint64(1001), allUnconfirmed[testAddr1][0].LT)
		assert.Equal(t, uint64(2001), allUnconfirmed[testAddr2][0].LT)
	})
}

func TestAccountStore_CleanupAll(t *testing.T) {
	t.Run("cleans up transactions across all accounts", func(t *testing.T) {
		accountStore := NewAccountStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		store1 := accountStore.GetTxStore(testAddr1)
		store2 := accountStore.GetTxStore(testAddr2)

		// Account 1: Add finalized and expired transactions
		for i := range 2 {
			tx := &Tx{
				From: *address.MustParseAddr(testAddr1),
				ReceivedMessage: tracetracking.ReceivedMessage{
					TotalActionFees: big.NewInt(1000000),
				},
			}
			lt := uint64(1000 + i)
			err := store1.AddUnconfirmed(lt, currentTimeMs+10000, tx)
			require.NoError(t, err)
			err = store1.MarkFinalized(lt, true, tvm.ExitCodeSuccess)
			require.NoError(t, err)
		}

		tx := &Tx{From: *address.MustParseAddr(testAddr1)}
		err := store1.AddUnconfirmed(1100, currentTimeMs-10000, tx)
		require.NoError(t, err)

		// Account 2: Add finalized and expired transactions
		for i := range 3 {
			tx := &Tx{
				From: *address.MustParseAddr(testAddr2),
				ReceivedMessage: tracetracking.ReceivedMessage{
					TotalActionFees: big.NewInt(1000000),
				},
			}
			lt := uint64(2000 + i)
			err := store2.AddUnconfirmed(lt, currentTimeMs+10000, tx)
			require.NoError(t, err)
			err = store2.MarkFinalized(lt, true, tvm.ExitCodeSuccess)
			require.NoError(t, err)
		}

		for i := range 2 {
			tx := &Tx{From: *address.MustParseAddr(testAddr2)}
			lt := uint64(2100 + i)
			err := store2.AddUnconfirmed(lt, currentTimeMs-10000, tx)
			require.NoError(t, err)
		}

		// Cleanup all
		finalizedTxs, expiredTxs := accountStore.CleanupAll(currentTimeMs)

		assert.Len(t, finalizedTxs, 5) // 2 from account1 + 3 from account2
		assert.Len(t, expiredTxs, 3)   // 1 from account1 + 2 from account2
	})

	t.Run("returns zero counts when no transactions to cleanup", func(t *testing.T) {
		accountStore := NewAccountStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		finalized, expired := accountStore.CleanupAll(currentTimeMs)

		assert.Empty(t, finalized)
		assert.Empty(t, expired)
	})

	t.Run("only cleans up expired transactions when no finalized exist", func(t *testing.T) {
		accountStore := NewAccountStore()
		currentTimeMs := uint64(time.Now().UnixMilli())

		store := accountStore.GetTxStore(testAddr1)

		// Add only expired unconfirmed transactions
		for i := range 4 {
			tx := &Tx{From: *address.MustParseAddr(testAddr1)}
			lt := uint64(3000 + i)
			err := store.AddUnconfirmed(lt, currentTimeMs-10000, tx)
			require.NoError(t, err)
		}

		finalized, expired := accountStore.CleanupAll(currentTimeMs)

		assert.Empty(t, finalized)
		assert.Len(t, expired, 4)
	})
}

func TestTxStore_InflightCount(t *testing.T) {
	t.Run("returns correct count of unconfirmed transactions", func(t *testing.T) {
		store := NewTxStore()

		assert.Equal(t, 0, store.InflightCount())

		// Add unconfirmed transactions
		for i := range 5 {
			tx := &Tx{From: *address.MustParseAddr(testAddr1)}
			err := store.AddUnconfirmed(uint64(1000+i), 2000000, tx)
			require.NoError(t, err)
		}

		assert.Equal(t, 5, store.InflightCount())

		// Finalize one
		err := store.MarkFinalized(1000, true, tvm.ExitCodeSuccess)
		require.NoError(t, err)

		assert.Equal(t, 4, store.InflightCount())
	})
}
