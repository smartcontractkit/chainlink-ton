package poc_test

import (
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/poc"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
)

func NewTestContext(t *testing.T, config TestConfig) *TestContext {
	return &TestContext{
		Config: config,
	}
}

func NewTestConfig() TestConfig {
	return TestConfig{
		NetworkConfigURL:            "http://127.0.0.1:8000/localhost.global.config.json",
		FundingAmount:               "1000",
		ContractFunding:             "0.02",
		MessageAmount:               "0.1",
		ResetOpCode:                 0x3dc2af2d,
		CounterIncrementEventOpCode: 0x1002,
		CounterResetEventOpCode:     0x1001,
	}
}

type TestConfig struct {
	NetworkConfigURL string
	FundingAmount    string
	ContractFunding  string
	MessageAmount    string

	// Contract operation codes
	ResetOpCode uint64

	// Expected event op codes (extracted from contract)
	CounterIncrementEventOpCode uint64
	CounterResetEventOpCode     uint64
}

type TestContext struct {
	ConnectionPool  *liteclient.ConnectionPool
	Client          ton.APIClientWrapped
	Wallet          *wallet.Wallet
	ContractAddress *address.Address
	Config          TestConfig
}

func Test_TON_Events_POC(t *testing.T) {
	config := NewTestConfig()
	ctx := NewTestContext(t, config)

	t.Log("Setting up network connection and wallet...")

	ctx.ConnectionPool = liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(t.Context(), ctx.Config.NetworkConfigURL)
	require.NoError(t, err, "Failed to get network config")

	err = ctx.ConnectionPool.AddConnectionsFromConfig(t.Context(), cfg)
	require.NoError(t, err, "Failed to connect to TON network")

	ctx.Client = ton.NewAPIClient(ctx.ConnectionPool).WithRetry()
	ctx.Wallet = testutils.CreateTonWallet(t, ctx.Client, wallet.V3R2, wallet.WithWorkchain(0))

	t.Run("airdrop", func(t *testing.T) {
		testutils.FundTonWallets(t, ctx.Client,
			[]*address.Address{ctx.Wallet.WalletAddress()},
			[]tlb.Coins{tlb.MustFromTON(ctx.Config.FundingAmount)})

		require.Eventually(t, func() bool {
			block, err := ctx.Client.CurrentMasterchainInfo(t.Context())
			require.NoError(t, err)

			balance, err := ctx.Wallet.GetBalance(t.Context(), block)
			require.NoError(t, err)
			return !balance.IsZero()
		}, 60*time.Second, 500*time.Millisecond)

		t.Logf("Wallet %s funded successfully", ctx.Wallet.WalletAddress().String())
	})

	t.Run("deploy test contract", func(t *testing.T) {
		t.Log("Deploying test contract...")
		addr, err := testutils.DeployCounterContract(t.Context(), ctx.Client, ctx.Wallet)
		require.NoError(t, err, "Failed to deploy contract")

		ctx.ContractAddress = addr
		t.Logf("Contract deployed at: %s", addr.String())

		time.Sleep(15 * time.Second)
	})

	registry := poc.NewContractEventRegistry(true)
	registry.RegisterContractEvents(ctx.ContractAddress,
		&poc.CounterResetEvent{},
		&poc.CounterIncrementEvent{},
	)

	evs := poc.StartEventSubscription(t, ctx.Client, registry)
	defer evs.Stop()

	t.Run("increment counter", func(t *testing.T) {
		t.Log("Testing counter increment...")

		initialValue, err := testutils.GetCounterValue(t.Context(), ctx.Client, ctx.ContractAddress)
		require.NoError(t, err, "Failed to get initial counter value")
		t.Logf("Initial counter value: %d", initialValue)

		ctx.Wallet.SendWaitTransaction(t.Context(), testutils.IncrementMessage(ctx.ContractAddress))
		time.Sleep(5 * time.Second)

		event, err := evs.WaitForEvent(func(e *poc.Event) bool {
			_, ok := e.AsCounterIncrement()
			return ok
		}, 20*time.Second)
		require.NoError(t, err, "Failed to wait for counter increment event")
		t.Logf("=== Counter increment event received: %+v", event.Data)
		ev, ok := event.AsCounterIncrement()
		require.True(t, ok, "Event should be of type CounterIncrementEvent")
		t.Logf("Counter increment event data: %+v", ev)
		require.NotNil(t, ev.TriggeredBy, "Increment event should have triggered_by address")
		require.NotNil(t, ev.NewValue, "Increment event should have new_value")
		require.NotNil(t, ev.Timestamp, "Increment event should have timestamp")
		t.Logf("Increment event source address: %s", event.Source.String())
		t.Logf("Increment event raw body: %s", event.RawBody.Dump())

		// Verify counter was incremented
		newValue, err := testutils.GetCounterValue(t.Context(), ctx.Client, ctx.ContractAddress)
		require.NoError(t, err, "Failed to get new counter value")
		t.Logf("New counter value: %d", newValue)

		expectedValue := big.NewInt(0).Add(initialValue, big.NewInt(1))
		require.Equal(t, 0, newValue.Cmp(expectedValue), "Counter should have incremented by 1")
	})

	t.Run("increment counter", func(t *testing.T) {
		t.Log("Testing counter reset...")

		ctx.Wallet.SendWaitTransaction(t.Context(), testutils.ResetMessage(ctx.ContractAddress))

		event, err := evs.WaitForEvent(func(e *poc.Event) bool {
			_, ok := e.AsCounterReset()
			return ok
		}, 20*time.Second)
		require.NoError(t, err, "Failed to wait for counter reset event")
		t.Logf("=== Counter reset event received: %+v", event.Data)
		ev, ok := event.AsCounterReset()
		require.True(t, ok, "Event should be of type CounterResetEvent")
		t.Logf("Counter reset event data: %+v", ev)
		require.NotNil(t, ev.ResetBy, "Reset event should have reset_by address")
		require.NotNil(t, ev.Timestamp, "Reset event should have timestamp")
		t.Logf("Reset event source address: %s", event.Source.String())
		t.Logf("Reset event raw body: %s", event.RawBody.Dump())

		resetValue, err := testutils.GetCounterValue(t.Context(), ctx.Client, ctx.ContractAddress)
		require.NoError(t, err, "Failed to get reset counter value")
		t.Logf("Counter value after reset: %d", resetValue)

		require.True(t, resetValue.Cmp(big.NewInt(0)) == 0, "Counter should be reset to 0")
	})

	t.Run("poll for increment and reset events", func(t *testing.T) {
		t.Log("Polling for increment and reset events...")

		events, err := poc.PollEventsFromContracts(
			t.Context(),
			ctx.Client,
			ctx.ConnectionPool,
			registry,
			10,
		)
		require.NoError(t, err, "Polling failed")

		if len(events) == 0 {
			t.Fatal("=== No events found during polling")
		}

		var foundIncrement, foundReset bool

		for i, event := range events {
			t.Logf("= Event %d: Data=%+v", i, event.Data)

			if inc, ok := event.AsCounterIncrement(); ok {
				foundIncrement = true
				t.Logf("  NewValue: %d", inc.NewValue)
				t.Logf("  TriggeredBy: %s", inc.TriggeredBy.String())
				t.Logf("  Timestamp: %d", inc.Timestamp)
				t.Logf("  Raw Body: %s", event.RawBody.Dump())
				continue
			}

			if reset, ok := event.AsCounterReset(); ok {
				foundReset = true
				t.Logf("  ResetBy: %s", reset.ResetBy.String())
				t.Logf("  Timestamp: %d", reset.Timestamp)
				t.Logf("  Raw Body: %s", event.RawBody.Dump())
				continue
			}

			t.Logf("Unknown event format: %+v", event)
		}

		require.True(t, foundIncrement, "Expected to find a CounterIncrementEvent in polled events")
		require.True(t, foundReset, "Expected to find a CounterResetEvent in polled events")
	})
}
