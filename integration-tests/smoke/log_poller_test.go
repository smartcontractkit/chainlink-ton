package smoke

import (
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	event_emitter "integration-tests/smoke/logpoller/eventemitter"
	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

func Test_LogPoller(t *testing.T) {
	logger := logger.Test(t)

	nodeClient := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector, true)
	require.NotNil(t, nodeClient)

	admin := test_utils.CreateTonWallet(t, nodeClient, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, admin)

	tonChain := test_utils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, admin)
	require.NotNil(t, tonChain)
	t.Log(admin.Address().String())

	test_utils.FundTonWallets(t, nodeClient, []*address.Address{admin.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})

	runLogPollerPollingTest(t, logger, tonChain)
}

func runLogPollerPollingTest(t *testing.T, logger logger.Logger, tonChain cldf_ton.Chain) {
	client := tonChain.Client

	senderA := test_utils.CreateTonWallet(t, client, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, senderA)
	senderB := test_utils.CreateTonWallet(t, client, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, senderB)

	test_utils.FundTonWallets(t, client, []*address.Address{senderA.Address(), senderB.Address()}, []tlb.Coins{tlb.MustFromTON("1000"), tlb.MustFromTON("1000")})

	destChainSelA := rand.Uint64()
	destChainSelB := rand.Uint64()

	// just use two different contracts and emitter helpers to simplify the test...
	evA, err := event_emitter.NewEventEmitter(t, client, "evA", destChainSelA, senderA)
	require.NoError(t, err)

	evB, err := event_emitter.NewEventEmitter(t, client, "evB", destChainSelB, senderB)
	require.NoError(t, err)

	require.NotEqual(t, evA.ContractAddress().String(), evB.ContractAddress().String(), "deployed event emitter contracts should have different addresses")

	b, err := client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	resDestChainSelA, err := event_emitter.GetDestinationChain(t.Context(), client, b, evA.ContractAddress())
	require.NoError(t, err)
	require.Equal(t, destChainSelA, resDestChainSelA.Uint64(), "unexpected destination chain selector for contract A")

	resDestChainSelB, err := event_emitter.GetDestinationChain(t.Context(), client, b, evB.ContractAddress())
	require.NoError(t, err)
	require.Equal(t, destChainSelB, resDestChainSelB.Uint64(), "unexpected destination chain selector for contract B")

	lp := logpoller.NewLogPoller(
		logger,
		client,
		2*time.Second, // tick every 2s
		100,           // page size
	)

	// register filters
	filterA := types.Filter{
		Address:    *evA.ContractAddress(),
		EventName:  "CCIPMessageSent",
		EventTopic: 0x99,
	}
	lp.RegisterFilter(t.Context(), filterA)

	filterB := types.Filter{
		Address:    *evB.ContractAddress(),
		EventName:  "CCIPMessageSent",
		EventTopic: 0x99,
	}
	lp.RegisterFilter(t.Context(), filterB)

	require.NoError(t, lp.Start(t.Context()))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// start event emitters
	err = evA.StartEventEmitter(t.Context(), 2*time.Second)
	require.NoError(t, err)
	require.True(t, evA.IsRunning(), "event emitter A should be running")

	err = evB.StartEventEmitter(t.Context(), 3*time.Second)
	require.NoError(t, err)
	require.True(t, evB.IsRunning(), "event emitter B should be running")

	time.Sleep(30 * time.Second) // wait for event emitters to start and emit events

	b, err = client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)
	onchainSeqNoA, err := event_emitter.GetSequenceNumber(t.Context(), client, b, evA.ContractAddress())
	require.NoError(t, err)
	onchainSeqNoB, err := event_emitter.GetSequenceNumber(t.Context(), client, b, evB.ContractAddress())
	require.NoError(t, err)

	t.Logf("Onchain sequence number for contract A: %s", onchainSeqNoA.String())
	t.Logf("Onchain sequence number for contract B: %s", onchainSeqNoB.String())

	require.True(t, onchainSeqNoA.Cmp(big.NewInt(0)) > 0, "unexpected sequence number for contract A")
	require.True(t, onchainSeqNoA.Cmp(onchainSeqNoB) > 0, "unexpected sequence number for contract B")

	// TODO: get logs by filter and validate if polling is not missing any events
	// TODO: scale up the number of events and validate that log poller can handle multiple events
	// // TODO: we can lookup block number by seqno
	// _, _, err = wallet.SendWaitTransaction(t.Context(), event_emitter.IncrementMessage(evA))
	// require.NoError(t, err)

	// require.Eventually(t, func() bool {
	// 	return len(lp.GetLogs()) > 0
	// }, 30*time.Second, 1*time.Second, "expected at least one increment event")

	// // TODO: add log query
	// logs := lp.GetLogs()

	// require.Len(t, logs, 1)
	// require.Equal(t, evA.String(), logs[0].Address.String())
	// require.Equal(t, uint64(1002), logs[0].EventTopic, "unexpected event topic")

	// var event event_emitter.CounterIncrementEvent
	// c, err := cell.FromBOC(logs[0].Data)
	// require.NoError(t, err, "failed to parse BOC")
	// err = tlb.LoadFromCell(&event, c.BeginParse())
	// require.NoError(t, err, "failed to unmarshal CounterIncrementEvent")
	// require.Equal(t, uint32(1), event.NewValue, "unexpected new value in event")
	// require.Equal(t, wallet.Address().String(), event.TriggeredBy.String(), "unexpected triggered by address")
}
