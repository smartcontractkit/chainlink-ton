package txm_test

import (
	"context"
	"log"
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
)

var keystore *testutils.TestKeystore

func TestTxmLocal(t *testing.T) {
	logger := logger.Test(t)

	nodeClient := testutils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector)
	require.NotNil(t, nodeClient)
	logger.Debugw("Started MyLocalTON")

	wallet := testutils.CreateTonWallet(t, nodeClient, wallet.V3R2, wallet.WithWorkchain(0))
	require.NotNil(t, wallet)
	logger.Debugw("Created TON Wallet")

	tonChain := testutils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, wallet)
	require.NotNil(t, tonChain)

	time.Sleep(6 * time.Second)

	block, err := tonChain.Client.CurrentMasterchainInfo(context.Background())
	require.NoError(t, err)

	log.Println("master proof checks are completed successfully, now communication is 100% safe!")

	ctx := tonChain.Client.Client().StickyContext(context.Background())
	balance, err := wallet.GetBalance(ctx, block)
	require.False(t, balance.IsZero())

	logger.Debugw("Funded wallet")

	keystore := testutils.NewTestKeystore(t)
	keystore.AddKey(wallet.PrivateKey())
	require.NotNil(t, keystore)

	config := txm.DefaultConfigSet
	require.NotNil(t, config)

	runTxmTest(t, logger, config, tonChain, keystore, 5)
}

func runTxmTest(t *testing.T, logger logger.Logger, config txm.TONTxmConfig, tonChain cldf_ton.Chain, keystore loop.Keystore, iterations int) {
	ctx := context.Background()

	tonTxm := txm.New(logger, keystore, tonChain.Client, tonChain.Wallet, config)
	err := tonTxm.Start(ctx)
	require.NoError(t, err)
	defer func() {
		_ = tonTxm.Close()
	}()

	// 1. Deploy the counter contract
	counterAddr, stateInit, err := testutils.DeployCounterContract(ctx, tonChain.Client, tonChain.Wallet)
	require.NoError(t, err)

	// // 2. Send deploy tx
	body := cell.BeginCell().
		// MustStoreUInt(4, 32).  // opcode: SetCount
		// MustStoreUInt(1, 64).  // queryId
		// MustStoreUInt(14, 32). // newCount
		EndCell()
	err = tonTxm.Enqueue(txm.TONTxmRequest{
		FromWallet:      *tonChain.Wallet,
		ContractAddress: *counterAddr,
		Amount:          tlb.MustFromTON("0.05"),
		Bounce:          false,
		StateInit:       stateInit,
		Body:            body,
	})
	require.NoError(t, err)

	// Wait for deployment tx
	time.Sleep(10 * time.Second)

	// 3. Check initial state
	initial, err := testutils.ReadCounter(ctx, tonChain.Client, counterAddr)
	require.NoError(t, err)
	logger.Infow("Deployed counter contract", "address", counterAddr.String(), "stateInit", stateInit.String())
	logger.Infow("Initial counter value", "value", initial)

	require.Equal(t, uint64(0), initial)

	// // 4. Increment multiple times
	// expected := initial
	// for i := 0; i < iterations; i++ {
	// 	body, err := testutils.EncodeIncrement()
	// 	require.NoError(t, err)

	// 	err = tonTxm.Enqueue(txm.TONTxmRequest{
	// 		FromAddress:     *tonChain.Wallet.Address(),
	// 		ContractAddress: *counterAddr,
	// 		Amount:          tlb.MustFromTON("0.05"),
	// 		Bounce:          true,
	// 		Body:            body,
	// 	})
	// 	require.NoError(t, err)
	// 	expected++
	// }

	// // 5. Wait for all txs to process
	// for {
	// 	queueLen, unconfirmedLen := tonTxm.InflightCount()
	// 	logger.Debugw("Inflight count", "queued", queueLen, "unconfirmed", unconfirmedLen)
	// 	if queueLen == 0 && unconfirmedLen == 0 {
	// 		break
	// 	}
	// 	time.Sleep(500 * time.Millisecond)
	// }

	// time.Sleep(5 * time.Second) // finality buffer

	// // 6. Verify final counter value
	// final, err := testutils.ReadCounter(ctx, tonChain.Client, counterAddr)
	// require.NoError(t, err)
	// require.Equal(t, expected, final)
	// logger.Infow("Final counter value", "value", final)
}
