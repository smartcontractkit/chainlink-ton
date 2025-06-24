package logpoller_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
)

type CounterIncrementEvent struct {
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

func (CounterIncrementEvent) Topic() uint64 { return 1002 }

// TODO: move this to integration tests
func Test_LogPoller(t *testing.T) {
	ctx := context.Background()
	// TODO: access TON chain via CTFv2 
	pool := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(ctx, "http://127.0.0.1:8000/localhost.global.config.json")
	require.NoError(t, err)
	require.NoError(t, pool.AddConnectionsFromConfig(ctx, cfg))

	client := ton.NewAPIClient(pool).WithRetry()
	w := testutils.CreateTonWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))

	testutils.FundTonWallets(t, client,
		[]*address.Address{w.WalletAddress()},
		[]tlb.Coins{tlb.MustFromTON("1000")},
	)
	require.Eventually(t, func() bool {
		m, err := client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err)
		bal, err := w.GetBalance(ctx, m)
		require.NoError(t, err)
		return !bal.IsZero()
	}, 60*time.Second, 500*time.Millisecond)

	addr, err := testutils.DeployCounterContract(ctx, client, w)
	require.NoError(t, err)
	time.Sleep(15 * time.Second)

	lp := logpoller.NewLogPoller(
		logger.Test(t),
		client,
		2*time.Second, // tick every 2s
		100,           // page size
	)
	// register our increment‐event filter
	flt := logpoller.Filter{
		Name:    "ctr_inc",
		Address: addr,
		Topic:   1002,
	}
	require.NoError(t, lp.RegisterFilter(ctx, flt,
		CounterIncrementEvent{}),
	)

	require.NoError(t, lp.Start(ctx))

	w.SendWaitTransaction(ctx, testutils.IncrementMessage(addr))

	require.Eventually(t, func() bool {
		return len(lp.Store().ListEvents()) > 0
	}, 30*time.Second, 1*time.Second, "expected at least one increment event")

	evs := lp.Store().ListEvents()
	require.Len(t, evs, 1)
	t.Logf("Event: %+v", evs[0])
	require.Equal(t, addr.String(), evs[0].Source.String())
}
