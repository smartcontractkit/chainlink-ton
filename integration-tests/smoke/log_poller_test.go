package smoke

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"testing"
	"time"

	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

// TODO: reuse ccip event types
type CounterIncrementEvent struct {
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

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

	// TODO: use deployment test util
	addr, err := deployCounterContract(t.Context(), client, wallet)
	require.NoError(t, err)

	// TODO: better way to wait for contract deployment
	time.Sleep(15 * time.Second)

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
	_, _, err = wallet.SendWaitTransaction(t.Context(), incrementMessage(addr))
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
	require.Equal(t, wallet.Address().String(), event.TriggeredBy.String(), "unexpected triggered by address")
}


// TODO: gobindings below should be in contracts/bindings/go, we can also consider separating go modules by production and test contracts 
func deployCounterContract(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet) (*address.Address, error) {
	addr, _, _, err := wallet.DeployContractWaitTransaction(
		ctx,
		tlb.MustFromTON("0.2"),
		cell.BeginCell().EndCell(),
		getTestContractCode(),
		// contract init data
		cell.BeginCell().
			MustStoreAddr(wallet.WalletAddress()).
			MustStoreUInt(0, 32).
			EndCell(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy counter contract: %w", err)
	}

	return addr, nil
}

func incrementMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x12345678, 32). // Any non-reset op code
		MustStoreUInt(0, 64).          // Query ID
		EndCell()

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}

	return msg
}

const OpResetCounter = 0x3dc2af2d

func resetMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(OpResetCounter, 32). // Reset op code
		MustStoreUInt(0, 64).              // Query ID
		EndCell()

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}
	return msg
}

// getters
func getCounterValue(ctx context.Context, client ton.APIClientWrapped, contractAddress *address.Address) (*big.Int, error) {
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	res, err := client.RunGetMethod(ctx, b, contractAddress, "counter")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'counter': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract counter value: %w", err)
	}

	return val, nil
}

func getOwner(ctx context.Context, client ton.APIClientWrapped, contractAddress *address.Address) (*address.Address, error) {
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	res, err := client.RunGetMethod(ctx, b, contractAddress, "owner")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'owner': %w", err)
	}

	addrSlice, err := res.Slice(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract owner address slice: %w", err)
	}

	addr, err := addrSlice.LoadAddr()
	if err != nil {
		return nil, fmt.Errorf("failed to load owner address: %w", err)
	}

	return addr, nil
}

// TODO: use artifact from test contract
func getTestContractCode() *cell.Cell {
	var hexBOC = "b5ee9c7241010a0100f6000114ff00f4a413f4bcf2c80b0102016202070202cd0306020120040500e34eda2edfbed44d0fa4001f861d31f30f86201d0d30331fa4030f8415210c7058e3021c70091318e2801d31f3082103dc2af2dba8e1a70f862c8f841cf16f84201cb1fc9ed548103e9f82358f003db31e0e29131e2f842a4f862c8f841cf16f84201cb1fc9ed548103eaf823f8425502f0048003158208630000c8cb1613cbf770cf0b61cb1f01cf16c970fb0080037d410431800064658b0a65fbb86785b089658fe58f80e78b64b87d80402012008090023be28ef6a2687d2000fc30e98f987c317c20c0023bcd0c76a2687d2000fc30e98f987c317c2146be57319"
	codeCellBytes, _ := hex.DecodeString(hexBOC)

	codeCell, err := cell.FromBOC(codeCellBytes)
	if err != nil {
		panic(err)
	}

	return codeCell
}
