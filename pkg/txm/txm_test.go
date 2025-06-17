package txm_test

import (
	"context"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
	"github.com/smartcontractkit/chainlink-ton/testutils"
	"github.com/smartcontractkit/chainlink-ton/tonutils"
)

var keystore *testutils.TestKeystore

var walletVersion = wallet.ConfigHighloadV3{
	MessageTTL: 120, // 2 minutes TTL
	MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
		tm := time.Now().Unix() - 30
		return uint32(10000 + tm%(1<<23)), tm, nil
	},
}

func TestTxmLocal(t *testing.T) {
	logger := logger.Test(t)

	nodeClient := testutils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector)
	require.NotNil(t, nodeClient)
	logger.Debugw("Started MyLocalTON")

	wallet := testutils.CreateTonWallet(t, nodeClient, walletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, wallet)
	logger.Debugw("Created TON Wallet")

	tonChain := testutils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, wallet)
	require.NotNil(t, tonChain)

	ctx := tonChain.Client.Client().StickyContext(context.Background())

	require.Eventually(t, func() bool {
		block, err := tonChain.Client.CurrentMasterchainInfo(context.Background())
		require.NoError(t, err)

		balance, err := wallet.GetBalance(ctx, block)
		require.NoError(t, err)
		return !balance.IsZero()
	}, 60*time.Second, 500*time.Millisecond)

	logger.Debugw("Funded wallet")

	keystore := testutils.NewTestKeystore(t)
	keystore.AddKey(wallet.PrivateKey())
	require.NotNil(t, keystore)

	config := txm.DefaultConfigSet
	config.ConfirmPollSecs = 2

	runTxmTest(t, logger, config, tonChain, keystore, 5)
}

func runTxmTest(t *testing.T, logger logger.Logger, config txm.Config, tonChain cldf_ton.Chain, keystore loop.Keystore, iterations int) {
	ctx := context.Background()

	apiClient := tonutils.ApiClient{
		Api:    tonChain.Client,
		Wallet: *tonChain.Wallet,
	}
	tonTxm := txm.New(logger, keystore, apiClient, config)
	err := tonTxm.Start(ctx)
	require.NoError(t, err)
	defer func() {
		_ = tonTxm.Close()
	}()

	// 1. Deploy the counter contract
	counterAddr, stateInit, err := testutils.DeployCounterContract(ctx, tonChain.Client, tonChain.Wallet)
	require.NoError(t, err)

	// 2. Send deploy tx
	body := cell.BeginCell().EndCell()
	err = tonTxm.Enqueue(txm.Request{
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
	initial, err := testutils.ReadCounter(ctx, tonChain.Client, counterAddr)
	require.NoError(t, err)
	logger.Infow("Deployed counter contract", "address", counterAddr.String(), "stateInit", stateInit.String())
	logger.Infow("Initial counter value", "value", initial)
	require.Equal(t, uint64(0), initial)

	// 5. Increment multiple times
	queryId := uint64(0)
	expected := initial
	for i := 0; i < iterations; i++ {
		incrementMsgBody, err := testutils.EncodeIncrement(queryId)
		require.NoError(t, err)

		err = tonTxm.Enqueue(txm.Request{
			FromWallet:      *tonChain.Wallet,
			ContractAddress: *counterAddr,
			Amount:          tlb.MustFromTON("0.05"),
			Bounce:          true,
			Body:            incrementMsgBody,
		})
		require.NoError(t, err)
		expected++
		queryId++

		incrementMultMsgBody, err := testutils.EncodeIncrementMult(queryId, 3, 4) // incremented value
		require.NoError(t, err)

		err = tonTxm.Enqueue(txm.Request{
			FromWallet:      *tonChain.Wallet,
			ContractAddress: *counterAddr,
			Amount:          tlb.MustFromTON("0.05"),
			Bounce:          true,
			Body:            incrementMultMsgBody,
		})
		require.NoError(t, err)
		expected += 3 * 4
		queryId++
	}

	// 6. Wait for all txs
	waitForStableInflightCount(logger, tonTxm, 30*time.Second)

	// 7. Check final value
	final, err := testutils.ReadCounter(ctx, tonChain.Client, counterAddr)
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
