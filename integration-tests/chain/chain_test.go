package chain

import (
	"context"
	"math/big"
	"math/rand/v2"
	"strconv"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/smoke/logpoller/helper"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/proxy"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/relay"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
)

const ClientTTL = 30 * time.Second

func TestChain(t *testing.T) {
	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)

	// setupChain sets up a TON chain and a relay.Chain for testing, returning both.
	//
	// ds can be nil, in which case the relay.Chain will be created without a DataSource. Logpoller will fail to perform any database operations
	setupChain := func(ds sqlutil.DataSource, nodes func(string) config.Nodes) (relay.Chain, cldf_ton.Chain) {
		lggr := logger.Test(t)

		keystore := relayer_utils.NewTestKeystore(t)
		keystore.AddKey(tonChain.Wallet.PrivateKey())

		chainConfig := config.DefaultConfigSet
		chainConfig.ClientTTL = ClientTTL

		// PollPeriod doubles as the per-iteration timeout (see service.go), so it must
		// be large enough for a full poll (connect + load + resolve + save) to finish.
		chainConfig.LogPoller.PollPeriod = commonconfig.MustNewDuration(5 * time.Second)

		tonRelayChain, err := relay.NewChain(&config.TOMLConfig{
			Enabled:     new(true),
			ChainID:     strconv.FormatInt(int64(chainsel.TON_LOCALNET.ChainID), 10),
			NetworkName: chainsel.TON_LOCALNET.Name,
			Chain:       chainConfig,
			Nodes:       nodes(tonChain.URL),
		}, relay.ChainOpts{
			Logger:   lggr,
			KeyStore: keystore,
			DS:       ds,
		})
		require.NoError(t, err)
		t.Cleanup(func() { _ = tonRelayChain.Close() })
		return tonRelayChain, tonChain
	}

	t.Run("TestServiceInitializationIsNotBlockedByBrokenRPC", func(t *testing.T) {
		t.Parallel()
		// Verify that relay.NewChain can be called with a broken RPC and that it does not block service initialization.
		// Verify that context is not canceled.

		var disconnectedRPC *proxy.Proxy

		setupChain(nil, func(chainURL string) config.Nodes {
			disconnectedRPC = proxy.New(t, chainURL, proxy.BehaviourDisconnected)

			return config.Nodes{
				{
					Name: new("disconnected-rpc"),
					URL:  commonconfig.MustParseURL(disconnectedRPC.URL()),
				},
			}
		})
	})

	t.Run("TestClientRotation", func(t *testing.T) {
		t.Parallel()
		var initiallyHealthyRPC, initiallyDisconnectedRPC *proxy.Proxy

		tonChain, _ := setupChain(nil, func(chainURL string) config.Nodes {
			initiallyHealthyRPC = proxy.New(t, chainURL, proxy.BehaviourEnabled)
			initiallyDisconnectedRPC = proxy.New(t, chainURL, proxy.BehaviourDisconnected)

			return config.Nodes{
				{
					Name: new("initially-healthy-rpc"),
					URL:  commonconfig.MustParseURL(initiallyHealthyRPC.URL()),
				},
				{
					Name: new("initially-disconnected-rpc"),
					URL:  commonconfig.MustParseURL(initiallyDisconnectedRPC.URL()),
				},
			}
		})

		// Should give us a client based on the healthy RPC (rpcA)
		// wait for the initial client to be created
		txmClientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
			signed, err := tonChain.TxManager().GetClient(ctx)
			if err != nil {
				return nil, err
			}
			return signed.Client, nil
		}

		txmResolvesHealthyClient := getClient(t, txmClientProvider, requireHealthyClient)
		require.Eventually(t, txmResolvesHealthyClient, relay.ConnectionTimeout*2, 100*time.Millisecond)
		// Once we get a healthy client for the first time, we should get it every time. Checking multiple times due to round robin.
		requireAlways(t, txmResolvesHealthyClient, 5*time.Second, 100*time.Millisecond)

		// Disable initiallyHealthyRPC and expect the client to become unhealthy
		initiallyHealthyRPC.Close()
		require.Eventually(t, getClient(t, tonChain.GetClient, requireUnhealthyClient), 5*time.Second, 100*time.Millisecond)

		// Now enable initiallyDisconnectedRPC which should cause the relay to switch to initiallyDisconnectedRPC
		initiallyDisconnectedRPC.SetBehaviour(proxy.BehaviourEnabled)

		time.Sleep(ClientTTL) // Wait for the cached client to expire, which should cause the relay to switch to initiallyDisconnectedRPC

		// relay.Chain gives us a client connected to initiallyDisconnectedRPC after cached client expires
		require.Eventually(t, getClient(t, tonChain.GetClient, requireHealthyClient), relay.ConnectionTimeout*2, 100*time.Millisecond)
		requireAlways(t, getClient(t, tonChain.GetClient, requireHealthyClient), 5*time.Second, 100*time.Millisecond)

		// TXM should have also switched to initiallyDisconnectedRPC
		requireAlways(t, txmResolvesHealthyClient, 5*time.Second, 100*time.Millisecond)
	})

	// Verify that cached ConnectionPool can recover from a broken connection
	t.Run("TestHealsFromBrokenConnection", func(t *testing.T) {
		t.Parallel()
		var unstableRPC *proxy.Proxy

		tonChain, _ := setupChain(nil, func(chainURL string) config.Nodes {
			unstableRPC = proxy.New(t, chainURL, proxy.BehaviourEnabled)

			return config.Nodes{
				{
					Name: new("unstable-rpc"),
					URL:  commonconfig.MustParseURL(unstableRPC.URL()),
				},
			}
		})

		// Should give us a client based on the healthy RPC (rpcA)
		// wait for the initial client to be created
		txmClientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
			signed, err := tonChain.TxManager().GetClient(ctx)
			if err != nil {
				return nil, err
			}
			return signed.Client, nil
		}

		clientTime := time.Now()
		require.Eventually(t, getClient(t, txmClientProvider, requireHealthyClient), 5*time.Second, 200*time.Millisecond)

		// Now disconnect unstableRPC while keeping its listener alive, so the same
		// endpoint can later recover.
		unstableRPC.SetBehaviour(proxy.BehaviourDisconnected)
		unstableRPC.DropConnections()

		// relay.Chain will keep giving us a client based on the unstable RPC, which is now broken
		require.Eventually(t, getClient(t, tonChain.GetClient, requireUnhealthyClient), 5*time.Second, 200*time.Millisecond)
		require.Less(t, time.Since(clientTime), ClientTTL, "Client should have been cached and not expired yet")

		// Now enable unstableRPC again, which should enable getClient to return a healthy client again
		unstableRPC.SetBehaviour(proxy.BehaviourEnabled)

		// relay.Chain should now give us a client based on the healthy RPC (unstableRPC)
		require.Eventually(t, getClient(t, tonChain.GetClient, requireHealthyClient), 2*ClientTTL+relay.ConnectionTimeout, 2*time.Second)
	})

	t.Run("TestDontStallOnConnection", func(t *testing.T) {
		t.Parallel()
		// The log poller persists its resume checkpoint and ingested logs, so it
		// needs a real DataSource with the log poller tables created.
		ds := pgtest.SetupTestDB(t)
		require.NoError(t, pgtest.ExecuteSQL(t.Context(), ds, testdata.CreateLogPollerTables))

		// Two RPCs, both initially unusable: stalled-rpc accepts the TCP connection
		// but never finishes the ADNL handshake; unstable-rpc refuses connections.
		// The bug: the poller wedges forever on stalled-rpc's handshake and never
		// rotates, so enabling unstable-rpc below never helps. With a connection
		// timeout the poller gives up on stalled-rpc and rotates to unstable-rpc.
		var unstableRPC *proxy.Proxy
		relayChain, tonChain := setupChain(ds, func(chainURL string) config.Nodes {
			stalledRPC := proxy.New(t, chainURL, proxy.BehaviourStall)
			unstableRPC = proxy.New(t, chainURL, proxy.BehaviourDisconnected)
			return config.Nodes{
				{
					Name: new("stalled-rpc"),
					URL:  commonconfig.MustParseURL(stalledRPC.URL()),
				},
				{
					Name: new("unstable-rpc"),
					URL:  commonconfig.MustParseURL(unstableRPC.URL()),
				},
			}
		})

		// Deploy an event-emitting contract using the chain's direct, always-healthy
		// client. The emitter must work regardless of the poller's RPC state.
		sender, err := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
		require.NoError(t, err)
		require.NoError(t, test_utils.FundWallets(
			t, tonChain.Client,
			[]*address.Address{sender.Address()},
			[]tlb.Coins{tlb.MustFromTON("1000")},
		))
		emitter, err := helper.NewTestEventSource(t.Context(), tonChain.Client, sender, "emitter", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		// Register a filter for the emitter's events on the poller, whose RPCs are
		// both currently unusable.
		lp := relayChain.LogPoller()
		_, err = lp.RegisterFilter(t.Context(), models.Filter{
			Name:     "emitter",
			Address:  emitter.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased,
		})
		require.NoError(t, err)

		require.NoError(t, lp.Start(t.Context()))
		t.Cleanup(func() { _ = lp.Close() })

		// Give the poller time to attempt (and, with the fix, time out on) the stalled
		// RPC before the other one recovers. With the bug the first attempt wedges the
		// run loop forever, so enabling unstable-rpc never helps.
		time.Sleep(2 * time.Second)

		// unstable-rpc recovers; the poller must rotate to it past the stalled one.
		t.Log("Enabling unstable-rpc; poller must rotate to it past the stalled RPC")
		unstableRPC.SetBehaviour(proxy.BehaviourEnabled)

		// Emit a known number of events through the direct client.
		const targetCounter = 3
		evctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
		defer cancel()
		require.NoError(t, emitter.Start(evctx, time.Second, big.NewInt(targetCounter)))
		t.Cleanup(func() { _ = emitter.Wait() })

		// The proof that the poller recovered is behavioral: it ingests every event
		// emitted after the RPC became healthy. Had it permanently stalled on the
		// first connection (the bug), it would never ingest anything.
		require.Eventually(t, func() bool {
			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			if qerr != nil {
				t.Logf("query failed, retrying: %v", qerr)
				return false
			}
			t.Logf("poller ingested %d/%d events", len(logs), targetCounter)
			return len(logs) >= targetCounter
		}, 120*time.Second, 2*time.Second,
			"log poller never ingested the emitted events after the RPC recovered")
	})
}

func getClient(
	t *testing.T,
	getClient func(ctx context.Context) (ton.APIClientWrapped, error),
	clientAssertions ...func(t *testing.T, client ton.APIClientWrapped) bool,
) func() bool {
	return func() bool {
		var client ton.APIClientWrapped
		var err error
		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		client, err = getClient(ctx)
		defer cancel()
		if err != nil {
			t.Logf("Error getting client: %v", err)
			return false
		}
		for _, assertion := range clientAssertions {
			if !assertion(t, client) {
				return false
			}
		}
		return true
	}
}

func requireHealthyClient(t *testing.T, client ton.APIClientWrapped) bool {
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	_, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		t.Logf("Error calling CurrentMasterchainInfo: %v", err)
		return false
	}
	return true
}

func requireUnhealthyClient(t *testing.T, client ton.APIClientWrapped) bool {
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	_, err := client.CurrentMasterchainInfo(ctx)
	if err == nil {
		t.Logf("Expected error calling CurrentMasterchainInfo")
		return false
	}
	return true
}

func requireAlways(t *testing.T, condition func() bool, waitFor time.Duration, tick time.Duration) {
	timeout := time.After(waitFor)
	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return
		case <-ticker.C:
			require.True(t, condition(), "Condition not satisfied")
		}
	}
}
