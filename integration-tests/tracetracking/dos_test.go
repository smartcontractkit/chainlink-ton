package tracetracking

import (
	"fmt"
	"math/big"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/tracetracking/testutils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type Measurement struct {
	Count   int
	Elapsed time.Duration
	Cost    *big.Int
}

const WALLET_MAX_BATCH = 255

func TestDOS(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)
	step := 50
	min := 1
	max := 1000
	iterations := (max-min)/step + 1
	t.Logf("Running %d iterations with step %d\n", iterations, step)
	accs := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, uint(iterations*2))

	t.Run("TestDOS", func(t *testing.T) {
		var transferAmount = big.NewInt(100)

		measureTransferTime := func(t *testing.T, sender, receiver tracetracking.SignedAPIClient, count int) (lapsed time.Duration, attackCost *big.Int) {
			var messages []*wallet.Message = make([]*wallet.Message, count)
			balanceBeforeAttack := testutils.MustGetBalance(t, sender)

			for i := range count {
				transfer, err := sender.Wallet.BuildTransfer(receiver.Wallet.WalletAddress(), tlb.FromNanoTON(transferAmount), false, "deposit")
				require.NoError(t, err, "failed to build transfer: %w", err)
				messages[i] = transfer
			}
			batches := make([][]*wallet.Message, 0)
			for i := 0; i < len(messages); i += WALLET_MAX_BATCH {
				end := i + WALLET_MAX_BATCH
				if end > len(messages) {
					end = len(messages)
				}
				batches = append(batches, messages[i:end])
			}
			now := time.Now()
			for _, batch := range batches {
				lastExternalMessageTx, _, err := sender.Wallet.SendManyWaitTransaction(t.Context(), batch)
				require.NoError(t, err, "failed to send transaction: %w", err)
				externalMessageReceived, err := tracetracking.MapToReceivedMessage(lastExternalMessageTx)
				require.NoError(t, err, "failed to get outgoing messages")
				err = externalMessageReceived.WaitForTrace(receiver.Client)
				require.NoError(t, err, "failed to wait for trace")
			}

			lapsed = time.Since(now)
			balanceAfterAttack := testutils.MustGetBalance(t, sender)
			attackCost = big.NewInt(0).Sub(balanceBeforeAttack, balanceAfterAttack)
			return lapsed, attackCost
		}

		t.Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		handles := make([]chan Measurement, iterations)
		periods := make([]Measurement, iterations)
		for i := range iterations {
			handle := make(chan Measurement)
			handles[i] = handle
			sender := accs[i*2]
			receiver := accs[(i*2)+1]
			count := 1 + (i * step)
			t.Logf("Starting transfer with count %d\n", count)
			go func(ch chan Measurement) {
				defer close(ch)
				elapsed, attackCost := measureTransferTime(t, sender, receiver, count)
				ch <- Measurement{
					Count:   count,
					Elapsed: elapsed,
					Cost:    attackCost,
				}
			}(handle)

			periods[i] = <-handle
		}

		rows := ""
		for _, p := range periods {
			rows += fmt.Sprintf("%d,%s,%s\n", p.Count, p.Elapsed, p.Cost.String())
		}
		t.Logf("Msg Count,Delay,Cost\n%s", rows)
		t.Fail()

		// Only run the assertion if we have at least 2 measurements
		if len(periods) >= 2 {
			require.Greater(t, periods[1].Elapsed, periods[0].Elapsed, "Expected positive duration")
		}
	})
}
