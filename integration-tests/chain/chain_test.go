package chain

import (
	"context"
	"strconv"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/proxy"
	"github.com/smartcontractkit/chainlink-ton/pkg/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/relay"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
)

const ClientTTL = 30 * time.Second

// setupChain sets up a TON chain and a relay.Chain for testing, returning both.
//
// ds can be nil, in which case the relay.Chain will be created without a DataSource. Logpoller will fail to perform any database operations
func setupChain(t *testing.T, ds sqlutil.DataSource, nodes func(string) config.Nodes) (relay.Chain, cldf_ton.Chain) {
	lggr := logger.Test(t)

	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)

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

func TestClientRotation(t *testing.T) {
	var initiallyHealthyRPC, initiallyDisconnectedRPC *proxy.Proxy

	tonChain, _ := setupChain(t, nil, func(chainURL string) config.Nodes {
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
	require.Eventually(t, txmResolvesHealthyClient, 5*time.Second, 100*time.Millisecond)
	// Once we get a healthy client for the first time, we should get it every time. Checking multiple times due to round robin.
	requireAlways(t, txmResolvesHealthyClient, 5*time.Second, 100*time.Millisecond)

	// Disable initiallyHealthyRPC and expect the client to become unhealthy
	initiallyHealthyRPC.Close()
	require.Eventually(t, getClient(t, tonChain.GetClient, requireUnhealthyClient), 5*time.Second, 100*time.Millisecond)

	// Now enable initiallyDisconnectedRPC which should cause the relay to switch to initiallyDisconnectedRPC
	initiallyDisconnectedRPC.SetBehaviour(proxy.BehaviourEnabled)

	time.Sleep(ClientTTL) // Wait for the cached client to expire, which should cause the relay to switch to initiallyDisconnectedRPC

	// relay.Chain gives us a client connected to initiallyDisconnectedRPC after cached client expires
	require.Eventually(t, getClient(t, tonChain.GetClient, requireHealthyClient), 5*time.Second, 100*time.Millisecond)
	requireAlways(t, getClient(t, tonChain.GetClient, requireHealthyClient), 5*time.Second, 100*time.Millisecond)

	// TXM should have also switched to initiallyDisconnectedRPC
	requireAlways(t, txmResolvesHealthyClient, 5*time.Second, 100*time.Millisecond)
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
