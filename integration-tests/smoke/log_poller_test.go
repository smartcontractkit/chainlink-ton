package smoke

import (
	"testing"
	"time"

	event_emitter "integration-tests/smoke/wrappers/eventemitter"
	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

func Test_LogPoller(t *testing.T) {
	logger := logger.Test(t)

	nodeClient := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector)
	require.NotNil(t, nodeClient)

	wallet := test_utils.CreateTonWallet(t, nodeClient, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, wallet)

	tonChain := test_utils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, wallet)
	require.NotNil(t, tonChain)

	test_utils.FundTonWallets(t, nodeClient, []*address.Address{wallet.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})

	runLogPollerTest(t, logger, tonChain)
}

func runLogPollerTest(t *testing.T, logger logger.Logger, tonChain cldf_ton.Chain) {
	client := tonChain.Client
	wallet := tonChain.Wallet

	// TODO: any context is not being used in contract helpers(ton/wrappers)
	addr, err := event_emitter.DeployCounterContract(t.Context(), client, wallet)
	require.NoError(t, err)

	lp := logpoller.NewLogPoller(
		logger,
		client,
		2*time.Second, // tick every 2s
		100,           // page size
	)

	// TODO: where should we initialize the log poller filters?
	// register our increment‐event filter
	filter := types.Filter{
		Address:    *addr,
		EventName:  "CounterIncrementEvent",
		EventTopic: 1002,
	}
	lp.RegisterFilter(t.Context(), filter)

	require.NoError(t, lp.Start(t.Context()))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// TODO: we can lookup block number by seqno
	_, _, err = wallet.SendWaitTransaction(t.Context(), event_emitter.IncrementMessage(addr))
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return len(lp.GetLogs()) > 0
	}, 30*time.Second, 1*time.Second, "expected at least one increment event")

	// TODO: add log query
	logs := lp.GetLogs()

	require.Len(t, logs, 1)
	require.Equal(t, addr.String(), logs[0].Address.String())
	require.Equal(t, uint64(1002), logs[0].EventTopic, "unexpected event topic")

	var event event_emitter.CounterIncrementEvent
	c, err := cell.FromBOC(logs[0].Data)
	require.NoError(t, err, "failed to parse BOC")
	err = tlb.LoadFromCell(&event, c.BeginParse())
	require.NoError(t, err, "failed to unmarshal CounterIncrementEvent")
	require.Equal(t, uint32(1), event.NewValue, "unexpected new value in event")
	require.Equal(t, wallet.Address().String(), event.TriggeredBy.String(), "unexpected triggered by address")
}
