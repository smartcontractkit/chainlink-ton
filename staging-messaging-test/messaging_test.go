package main

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	ethcommon "github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/stretchr/testify/require"
	tonaddress "github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

const messageReceivedEventABI = `[
  {"anonymous":false,"inputs":[
    {"indexed":false,"internalType":"bytes32","name":"messageId","type":"bytes32"},
    {"indexed":false,"internalType":"uint64","name":"sourceChainSelector","type":"uint64"},
    {"indexed":false,"internalType":"bytes","name":"sender","type":"bytes"},
    {"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},
    {"indexed":false,"components":[
        {"internalType":"address","name":"token","type":"address"},
        {"internalType":"uint256","name":"amount","type":"uint256"}
      ],
      "internalType":"struct Client.EVMTokenAmount[]",
      "name":"destTokenAmounts",
      "type":"tuple[]"
    }
  ],"name":"MessageReceived","type":"event"}
]`

func Test_StagingMessagingTest(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	env := setupTestEnvironment(t, ctx)

	seq, tonTxHash := sendCCIPFromTon(t, ctx, env.API, env.Wallet, env.RouterAddress, env.DestSelector, env.ReceiverBytes, []byte(env.MessageData))
	t.Logf("Sent CCIP message sequence tentative=%d tonTxHash=%s", seq, tonTxHash)

	startBlock, err := env.EthClient.BlockNumber(ctx)
	require.NoError(t, err, "failed to get starting block")

	fromBlock := startBlock + 1
	t.Logf("Waiting for MessageReceived event on receiver %s starting from block %d", "0x"+env.ReceiverHex, fromBlock)

	waitCtx, waitCancel := context.WithTimeout(ctx, 4*time.Minute)
	defer waitCancel()

	waitForMessageReceived(waitCtx, t, env.EthClient, ethcommon.HexToAddress("0x"+env.ReceiverHex), fromBlock, env.MessageData)

	t.Log("Test passed: message observed on receiver")
}

func sendCCIPFromTon(t *testing.T, ctx context.Context, api *ton.APIClient, w *wallet.Wallet, routerAddr *tonaddress.Address,
	destSelector uint64, receiverBytes, data []byte) (uint64, string) {

	// Create ExtraArgs for EVM destination
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(200000), // 200k gas limit
		AllowOutOfOrderExecution: false,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	require.NoError(t, err, "failed to serialize ExtraArgs")

	ccipSend := router.CCIPSend{
		QueryID:           uint64(time.Now().UnixNano()),
		DestChainSelector: destSelector,
		Receiver:          receiverBytes,
		Data:              data,
		TokenAmounts:      nil,
		FeeToken:          nil,
		ExtraArgs:         extraArgsCell,
	}

	messageBody, err := tlb.ToCell(ccipSend)
	require.NoError(t, err, "failed to serialize CCIPSend")

	msg := &wallet.Message{
		Mode: wallet.PayGasSeparately,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     routerAddr,
			Amount:      tlb.MustFromTON("1.0"), // TODO: adjust
			Body:        messageBody,
		},
	}

	tt := tracetracking.NewSignedAPIClient(api, *w)
	receivedMsg, _, err := tt.SendWaitTransaction(ctx, *routerAddr, msg)
	require.NoError(t, err, "send transaction failed")

	require.Equal(t, uint32(0), receivedMsg.ExitCode, "router execution failed")

	err = receivedMsg.WaitForTrace(api)
	require.NoError(t, err, "trace wait failed")

	//TODO: Parse sequence number from CCIPMessageSent event
	return 0, fmt.Sprintf("%x", receivedMsg.TxHash)
}

// waitForMessageReceived polls for MessageReceived events and validates the payload
func waitForMessageReceived(ctx context.Context, t *testing.T, ethClient *ethclient.Client, receiver ethcommon.Address, fromBlock uint64, expectedPayload string) {
	parsedABI, err := abi.JSON(strings.NewReader(messageReceivedEventABI))
	require.NoError(t, err, "parse abi")
	ev, ok := parsedABI.Events["MessageReceived"]
	require.True(t, ok, "event not in ABI")
	topic := ev.ID

	type TokenAmount struct {
		Token  ethcommon.Address
		Amount *big.Int
	}
	type Event struct {
		MessageId           [32]byte
		SourceChainSelector uint64
		Sender              []byte
		Data                []byte
		DestTokenAmounts    []TokenAmount
	}

	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			t.Fatalf("timeout waiting for MessageReceived event: %v", ctx.Err())
		case <-ticker.C:
			q := ethereum.FilterQuery{
				FromBlock: big.NewInt(int64(fromBlock)),
				Addresses: []ethcommon.Address{receiver},
				Topics:    [][]ethcommon.Hash{{topic}},
			}
			logs, err := ethClient.FilterLogs(ctx, q)
			if err != nil {
				continue
			}
			for _, lg := range logs {
				var decoded Event
				if err := parsedABI.UnpackIntoInterface(&decoded, "MessageReceived", lg.Data); err != nil {
					continue
				}
				require.Equal(t, expectedPayload, string(decoded.Data), "payload mismatch")
				t.Logf("MessageReceived: messageId=%x sourceChain=%d dataLen=%d tokens=%d block=%d",
					decoded.MessageId, decoded.SourceChainSelector, len(decoded.Data), len(decoded.DestTokenAmounts), lg.BlockNumber)
				return
			}
		}
	}
}
