package poc_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
)

// TestFetchContractTransactions demonstrates fetching all transactions
// for a specific smart contract by using LT/hash cursors rather than
// scanning entire blocks.
func TestFetchContractTransactions(t *testing.T) {
	ctx := context.Background()

	// ---- Setup connection & wallet ----
	pool := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(ctx, "http://127.0.0.1:8000/localhost.global.config.json")
	require.NoError(t, err)
	require.NoError(t, pool.AddConnectionsFromConfig(ctx, cfg))

	client := ton.NewAPIClient(pool).WithRetry()
	wallet := testutils.CreateTonWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))

	var contractAddress *address.Address

	t.Run("airdrop", func(t *testing.T) {
		testutils.FundTonWallets(t, client,
			[]*address.Address{wallet.WalletAddress()},
			[]tlb.Coins{tlb.MustFromTON("1000")})

		require.Eventually(t, func() bool {
			block, err := client.CurrentMasterchainInfo(ctx)
			require.NoError(t, err)

			bal, err := wallet.GetBalance(ctx, block)
			require.NoError(t, err)
			return !bal.IsZero()
		}, 60*time.Second, 500*time.Millisecond)

		t.Log("Wallet funded successfully")
	})

	t.Run("deploy test contract", func(t *testing.T) {
		addr, err := testutils.DeployCounterContract(ctx, client, wallet)
		require.NoError(t, err)
		contractAddress = addr
		t.Logf("Contract deployed at: %s", addr.String())
		time.Sleep(15 * time.Second)
	})

	t.Run("fetch contract txs with cursor paging", func(t *testing.T) {
		// 1) Record starting cursor at master block A
		masterA, err := client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err)
		acctA, err := client.GetAccount(ctx, masterA, contractAddress)
		require.NoError(t, err)
		startLT := acctA.LastTxLT

		// 2) Trigger sample transactions on the contract
		wallet.SendWaitTransaction(ctx, testutils.IncrementMessage(contractAddress))
		time.Sleep(5 * time.Second)
		wallet.SendWaitTransaction(ctx, testutils.ResetMessage(contractAddress))
		time.Sleep(5 * time.Second)

		// 3) Record ending cursor at master block B
		masterB, err := client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err)
		acctB, err := client.GetAccount(ctx, masterB, contractAddress)
		require.NoError(t, err)
		endLT, endHash := acctB.LastTxLT, acctB.LastTxHash

		require.Greater(t, endLT, startLT, "Expected at least one transaction after contract interaction")
		require.Greater(t, masterB.SeqNo, masterA.SeqNo, "Expected master block A to be older than B")

		// 4) Page through the contract's history from B back to A
		const pageSize = 50
		curLT, curHash := endLT, endHash
		var allTxs []*tlb.Transaction

		for {
			batch, err := client.ListTransactions(ctx, contractAddress, pageSize, curLT, curHash)
			if err != nil {
				if errors.Is(err, ton.ErrNoTransactionsWereFound) {
					break
				}
				require.NoError(t, err)
			}
			if len(batch) == 0 {
				break
			}

			// oldest→newest within batch
			for i := len(batch) - 1; i >= 0; i-- {
				tx := batch[i]
				if tx.LT <= startLT {
					goto DONE
				}
				allTxs = append(allTxs, tx)
			}

			// advance cursor for next page
			last := batch[len(batch)-1]
			curLT, curHash = last.PrevTxLT, last.PrevTxHash

			// fewer than pageSize -> no more
			if len(batch) < pageSize {
				break
			}
		}

	DONE:
		t.Logf("Fetched %d contract transactions", len(allTxs))
		require.Greater(t, len(allTxs), 0, "Expected at least one transaction for contract")
	})
}
