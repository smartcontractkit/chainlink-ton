package txm_test

import (
	"context"
	"math/big"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"

	test_utils "integration-tests/utils"

	counter_legacy "integration-tests/txm/wrappers/counter_legacy"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestTxmLocal(t *testing.T) {
	logger := logger.Test(t)

	nodeClient := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector)
	require.NotNil(t, nodeClient)
	logger.Debugw("Started MyLocalTON")

	wallet := test_utils.CreateTonWallet(t, nodeClient, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, wallet)
	logger.Debugw("Created TON Wallet")

	tonChain := test_utils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, wallet)
	require.NotNil(t, tonChain)

	test_utils.FundTonWallets(t, nodeClient, []*address.Address{wallet.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})

	keystore := relayer_utils.NewTestKeystore(t)
	keystore.AddKey(wallet.PrivateKey())
	require.NotNil(t, keystore)

	config := txm.DefaultConfigSet
	config.ConfirmPollSecs = 2

	runTxmTest(t, logger, config, tonChain, keystore, 5)
}

func runTxmTest(t *testing.T, logger logger.Logger, config txm.Config, tonChain cldf_ton.Chain, keystore loop.Keystore, iterations int) {
	ctx := context.Background()

	apiClient := tracetracking.SignedAPIClient{
		Client: tonChain.Client,
		Wallet: *tonChain.Wallet,
	}
	tonTxm := txm.New(logger, keystore, apiClient, config)
	err := tonTxm.Start(ctx)
	require.NoError(t, err)
	defer func() {
		_ = tonTxm.Close()
	}()

	// 1. Builds the counter contract state init
	counterCfg := counter_legacy.CounterConfig{
		ID:    big.NewInt(1337),
		Count: big.NewInt(0),
	}
	counterAddr, stateInit, err := counter_legacy.BuildCounterStateInit(ctx, counterCfg)
	require.NoError(t, err)

	// 2. Send deploy tx
	body := cell.BeginCell().EndCell()
	err = tonTxm.Enqueue(txm.Request{
		Mode:            wallet.PayGasSeparately,
		FromWallet:      *tonChain.Wallet,
		ContractAddress: *counterAddr,
		Amount:          tlb.MustFromTON("0.05"),
		Bounce:          true,
		StateInit:       stateInit,
		Body:            body,
	})
	require.NoError(t, err)

	// 3. Wait for deployment tx
	waitForStableInflightCount(logger, tonTxm, 15*time.Second)

	// 4. Check initial state
	initial, err := counter_legacy.GetCount(ctx, tonChain.Client, counterAddr)
	require.NoError(t, err)
	logger.Infow("Deployed counter contract", "address", counterAddr.String(), "stateInit", stateInit.String())
	logger.Infow("Initial counter value", "value", initial)
	require.Equal(t, uint64(0), initial)

	// 5. Increment multiple times
	queryID := uint64(0)
	expected := initial
	for i := 0; i < iterations; i++ {
		incrementMsgBody, incErr := counter_legacy.IncrementPayload(queryID)
		require.NoError(t, incErr)

		incErr = tonTxm.Enqueue(txm.Request{
			Mode:            wallet.PayGasSeparately,
			FromWallet:      *tonChain.Wallet,
			ContractAddress: *counterAddr,
			Amount:          tlb.MustFromTON("0.05"),
			Bounce:          true,
			Body:            incrementMsgBody,
		})
		require.NoError(t, incErr)
		expected++
		queryID++

		incrementMultMsgBody, incErr := counter_legacy.IncrementMultPayload(queryID, 3, 4) // incremented value
		require.NoError(t, incErr)

		incErr = tonTxm.Enqueue(txm.Request{
			Mode:            wallet.PayGasSeparately,
			FromWallet:      *tonChain.Wallet,
			ContractAddress: *counterAddr,
			Amount:          tlb.MustFromTON("0.05"),
			Bounce:          true,
			Body:            incrementMultMsgBody,
		})
		require.NoError(t, incErr)
		expected += 3 * 4
		queryID++
	}

	// 6. Wait for all txs
	waitForStableInflightCount(logger, tonTxm, 30*time.Second)

	// 7. Check final value
	final, err := counter_legacy.GetCount(ctx, tonChain.Client, counterAddr)
	require.NoError(t, err)
	logger.Infow("Final counter value", "value", final)
	require.Equal(t, expected, final)
}

func waitForStableInflightCount(logger logger.Logger, txm *txm.Txm, duration time.Duration) {
	const checkInterval = 200 * time.Millisecond
	stableSince := time.Now()
	stabilityReached := false

	for {
		queueLen, unconfirmedLen := txm.InflightCount()

		if queueLen == 0 && unconfirmedLen == 0 {
			if !stabilityReached {
				logger.Debugw("Inflight count stable at zero, starting timer")
				stabilityReached = true
			}
			if time.Since(stableSince) >= duration {
				logger.Debugw("Inflight count was stable for full duration", "duration", duration)
				return
			}
		} else {
			if stabilityReached {
				logger.Warnw("Inflight count was stable but changed", "queueLen", queueLen, "unconfirmedLen", unconfirmedLen, "elapsed", time.Since(stableSince))
			}
			stableSince = time.Now()
			stabilityReached = false
		}

		time.Sleep(checkInterval)
	}
}
