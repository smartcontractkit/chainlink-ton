package main

import (
	"context"
	"errors"
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
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
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

	seq := sendCCIPFromTon(t, ctx, env.API, env.Wallet, env.RouterAddress, env.DestSelector, env.ReceiverBytes, []byte(env.MessageData))
	t.Logf("Sent CCIP message sequence number=%d", seq)

	startBlock, err := env.EthClient.BlockNumber(ctx)
	require.NoError(t, err, "failed to get starting block")

	fromBlock := startBlock + 1
	t.Logf("Waiting for MessageReceived event on receiver %s starting from block %d", "0x"+env.ReceiverHex, fromBlock)

	waitCtx, waitCancel := context.WithTimeout(ctx, 4*time.Minute)
	defer waitCancel()

	waitForMessageReceived(waitCtx, t, env.EthClient, ethcommon.HexToAddress("0x"+env.ReceiverHex), fromBlock, env.MessageData)

	t.Log("Test passed: message observed on receiver")
}

func sendCCIPFromTon(t *testing.T, ctx context.Context, api *ton.APIClient, w *wallet.Wallet, routerAddr *tonaddress.Address, destSelector uint64, receiverBytes, data []byte) uint64 {
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(1000000),
		AllowOutOfOrderExecution: true,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	require.NoError(t, err, "failed to serialize ExtraArgs")

	ccipSend := router.CCIPSend{
		QueryID:           uint64(0),
		DestChainSelector: destSelector,
		Receiver:          receiverBytes,
		Data:              data,
		TokenAmounts:      nil,
		FeeToken:          address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
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
			Amount:      tlb.MustFromTON("0.1"),
			Body:        messageBody,
		},
	}

	tt := tracetracking.NewSignedAPIClient(api, *w)
	receivedMsg, _, err := tt.SendWaitTransaction(ctx, *routerAddr, msg)
	require.NoError(t, err, "send transaction failed")

	require.Equal(t, tvm.ExitCode(0), receivedMsg.ExitCode, "router execution failed")

	err = receivedMsg.WaitForTrace(api)
	require.NoError(t, err, "trace wait failed")

	sequenceNumber, err := extractSequenceFromCCIPMessageSent(receivedMsg)
	require.NoError(t, err, "failed to extract sequence number from CCIPMessageSent event")

	t.Logf("CCIP message sent: sequence=%d", sequenceNumber)

	return sequenceNumber
}

func extractSequenceFromCCIPMessageSent(msg *tracetracking.ReceivedMessage) (uint64, error) {
	if msg == nil {
		return 0, errors.New("received message is nil")
	}

	var messagesToProcess []*tracetracking.ReceivedMessage
	messagesToProcess = append(messagesToProcess, msg)

	var lastMsg *tracetracking.ReceivedMessage

	for len(messagesToProcess) > 0 {
		currentMsg := messagesToProcess[0]
		messagesToProcess = messagesToProcess[1:]

		if len(currentMsg.OutgoingInternalReceivedMessages) == 0 {
			continue
		}

		for _, outMsg := range currentMsg.OutgoingInternalReceivedMessages {
			if outMsg.ExitCode != 0 || !outMsg.Success {
				continue
			}

			messagesToProcess = append(messagesToProcess, outMsg)
			lastMsg = outMsg
		}
	}

	if lastMsg == nil || len(lastMsg.OutgoingExternalMessages) == 0 {
		return 0, errors.New("no outgoing external messages found")
	}

	var event onramp.CCIPMessageSent
	err := tlb.LoadFromCell(&event, lastMsg.OutgoingExternalMessages[0].Body.BeginParse())
	if err != nil {
		return 0, fmt.Errorf("failed to parse CCIPMessageSent from cell: %w", err)
	}

	return event.Message.Header.SequenceNumber, nil
}

func waitForMessageReceived(
	ctx context.Context,
	t *testing.T,
	ethClient *ethclient.Client,
	receiver ethcommon.Address,
	fromBlock uint64,
	expectedPayload string,
) {
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

	start := fromBlock
	const span uint64 = 20

	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			t.Fatalf("timeout waiting for MessageReceived event: %v", ctx.Err())

		case <-ticker.C:
			head, err := ethClient.BlockNumber(ctx)
			if err != nil {
				t.Logf("BlockNumber error: %v", err)
				continue
			}

			if start > head {
				t.Logf("Head=%d is behind start=%d; waiting...", head, start)
				continue
			}

			toU64 := start + span - 1
			if toU64 > head {
				toU64 = head
			}

			from := new(big.Int).SetUint64(start)
			to := new(big.Int).SetUint64(toU64)

			q := ethereum.FilterQuery{
				FromBlock: from,
				ToBlock:   to,
				Addresses: []ethcommon.Address{receiver},
				Topics:    [][]ethcommon.Hash{{topic}},
			}
			t.Logf("Querying logs from block %d to %d", q.FromBlock.Uint64(), q.ToBlock.Uint64())

			logs, err := ethClient.FilterLogs(ctx, q)
			if err != nil {
				t.Logf("FilterLogs error: %v", err)
				continue
			}

			nextStart := toU64 + 1

			for _, lg := range logs {
				if lg.BlockNumber+1 > nextStart {
					nextStart = lg.BlockNumber + 1
				}

				var decoded Event
				if err := parsedABI.UnpackIntoInterface(&decoded, "MessageReceived", lg.Data); err != nil {
					continue
				}

				got := string(decoded.Data)
				if got != expectedPayload {
					t.Logf("Ignoring MessageReceived with different payload (got=%q expected=%q) messageId=%x block=%d",
						got, expectedPayload, decoded.MessageId, lg.BlockNumber)
					continue
				}

				t.Logf("Matched MessageReceived: messageId=%x sourceChain=%d dataLen=%d tokens=%d block=%d",
					decoded.MessageId, decoded.SourceChainSelector, len(decoded.Data), len(decoded.DestTokenAmounts), lg.BlockNumber)
				return
			}

			start = nextStart
		}
	}
}
