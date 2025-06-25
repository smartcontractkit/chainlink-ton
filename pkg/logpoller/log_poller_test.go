package logpoller_test

import (
	"context"
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/freeport"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type CounterIncrementEvent struct {
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

// TODO: move this to integration tests
func Test_LogPoller(t *testing.T) {
	ctx := context.Background()

	useExistingTON := true
	var networkCfg string

	if !useExistingTON {
		bcInput := &blockchain.Input{
			Type:  "ton",
			Image: "ghcr.io/neodix42/mylocalton-docker:latest",
			Port:  strconv.Itoa(freeport.GetOne(t)),
		}

		bcOut, err := blockchain.NewBlockchainNetwork(bcInput)
		require.NoError(t, err, "failed to create blockchain network")
		networkCfg = fmt.Sprintf("http://%s/localhost.global.config.json", bcOut.Nodes[0].ExternalHTTPUrl)
	} else {
		networkCfg = "http://127.0.0.1:8000/localhost.global.config.json"
	}

	pool := liteclient.NewConnectionPool()

	cfg, err := liteclient.GetConfigFromUrl(ctx, networkCfg)

	require.NoError(t, err)
	require.NoError(t, pool.AddConnectionsFromConfig(ctx, cfg))

	client := ton.NewAPIClient(pool).WithRetry()
	w := testutils.CreateTonWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))

	testutils.FundTonWallets(t, client,
		[]*address.Address{w.WalletAddress()},
		[]tlb.Coins{tlb.MustFromTON("1000")},
	)
	// TODO: replace with airdrop util
	require.Eventually(t, func() bool {
		m, err := client.CurrentMasterchainInfo(ctx)
		if err != nil {
			return false
		}
		bal, err := w.GetBalance(ctx, m)
		if err != nil {
			return false
		}
		return !bal.IsZero()
	}, 60*time.Second, 500*time.Millisecond)

	addr, err := testutils.DeployCounterContract(ctx, client, w)
	require.NoError(t, err)

	// TODO: better way to wait for contract deployment
	time.Sleep(15 * time.Second)

	lp := logpoller.NewLogPoller(
		logger.Test(t),
		client,
		2*time.Second, // tick every 2s
		100,           // page size
	)

	// register our increment‐event filter
	filter := types.Filter{
		Address:    *addr,
		EventName:  "CounterIncrementEvent",
		EventTopic: 1002,
	}
	lp.RegisterFilter(ctx, filter)

	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// TODO: we can lookup block number by seqno
	_, _, err = w.SendWaitTransaction(ctx, testutils.IncrementMessage(addr))
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return len(lp.GetLogs()) > 0
	}, 30*time.Second, 1*time.Second, "expected at least one increment event")

	// TODO: add log query
	logs := lp.GetLogs()

	require.Len(t, logs, 1)
	require.Equal(t, addr.String(), logs[0].Address.String())
	require.Equal(t, uint64(1002), logs[0].EventTopic, "unexpected event topic")

	var event CounterIncrementEvent
	c, err := cell.FromBOC(logs[0].Data)
	require.NoError(t, err, "failed to parse BOC")
	err = tlb.LoadFromCell(&event, c.BeginParse())
	require.NoError(t, err, "failed to unmarshal CounterIncrementEvent")
	require.Equal(t, uint32(1), event.NewValue, "unexpected new value in event")
	require.Equal(t, w.Address().String(), event.TriggeredBy.String(), "unexpected triggered by address")
}
