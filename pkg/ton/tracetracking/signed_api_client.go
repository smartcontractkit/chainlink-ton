package tracetracking

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// SignedAPIClient provides a high-level interface for interacting with the TON blockchain.
// It wraps the low-level TON API client and wallet functionality to provide
// convenient messages for sending transactions, deploying contracts, and monitoring
// message flows.
type SignedAPIClient struct {
	Client ton.APIClientWrapped
	Wallet wallet.Wallet
}

func NewSignedAPIClient(client ton.APIClientWrapped, wallet wallet.Wallet) SignedAPIClient {
	return SignedAPIClient{
		Client: client,
		Wallet: wallet,
	}
}

func IsInboundExternalMessageRejectedByAccountError(err error) bool {
	return strings.HasPrefix(err.Error(), "wallet transaction error for destination") &&
		strings.Contains(err.Error(), "failed to send message: lite server error, code -701")
}

// SendWaitTransaction sends a transaction to the specified address and waits for
// it to be confirmed on the blockchain. It returns the resulting ReceivedMessage
// with outgoing messages (if any) and the block sequence number where the
// transaction was included.
//
// This message only waits for the initial transaction confirmation, not for any
// outgoing messages to be processed. Use SendAndWaitForTrace for complete trace waiting.
func (c *SignedAPIClient) SendWaitTransaction(ctx context.Context, dstAddr address.Address, messageToSend *wallet.Message) (*ReceivedMessage, *ton.BlockIDExt, error) {
	tx, block, err := c.Wallet.SendWaitTransaction(ctx, messageToSend)
	if err != nil {
		return nil, nil, fmt.Errorf("wallet transaction error for destination %s: %w", dstAddr.String(), err)
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	return &receivedMessage, block, nil
}

// BuildExternalMessage builds and signs the wallet's external message carrying messageToSend.
// Each call produces a distinct external message (for HighloadV3, a new query id), so to retry
// a send without risking a second execution, re-send the same external message: the wallet
// executes a given external message at most once.
func (c *SignedAPIClient) BuildExternalMessage(ctx context.Context, messageToSend *wallet.Message) (*tlb.ExternalMessage, error) {
	ext, err := c.Wallet.BuildExternalMessageForMany(ctx, []*wallet.Message{messageToSend})
	if err != nil {
		return nil, fmt.Errorf("failed to build external message: %w", err)
	}
	return ext, nil
}

// SendExternalWaitTransaction sends a prebuilt external message and waits for the wallet
// transaction that processes it, re-sending the same message while waiting. Errors are
// reported like SendWaitTransaction's, for the internal message's destination dstAddr.
func (c *SignedAPIClient) SendExternalWaitTransaction(ctx context.Context, dstAddr address.Address, ext *tlb.ExternalMessage) (*ReceivedMessage, error) {
	tx, _, _, err := c.Client.SendExternalMessageWaitTransaction(ctx, ext)
	if err != nil {
		return nil, fmt.Errorf("wallet transaction error for destination %s: %w", dstAddr.String(), err)
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	return &receivedMessage, nil
}

// FindExternalTransaction returns the wallet transaction that processed ext, searching the
// wallet's transactions made at or after the given time. It returns nil and no error only when
// all those transactions were checked and none processed ext.
func (c *SignedAPIClient) FindExternalTransaction(ctx context.Context, ext *tlb.ExternalMessage, after time.Time) (*ReceivedMessage, error) {
	tx, err := c.Client.FindLastTransactionByInMsgHashAfterTime(ctx, ext.DstAddr, ext.NormalizedHash(), after)
	// tonutils also reports ErrTxWasNotFound when the node no longer has the blocks to scan,
	// in which case it is unknown whether such a transaction exists.
	if errors.Is(err, ton.ErrTxWasNotFound) && !strings.Contains(err.Error(), "archive node is needed") {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up transaction for external message: %w", err)
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	return &receivedMessage, nil
}

// SendAndWaitForTrace sends a transaction to the specified address and waits for
// the complete execution trace, including all outgoing messages and their
// subsequent outgoing messages recursively. It ensures that the entire message
// cascade has been processed and finalized before returning.
//
// The message returns the resulting message in a Finalized state, meaning all
// outgoing messages have been confirmed and processed.
func (c *SignedAPIClient) SendAndWaitForTrace(ctx context.Context, dstAddr address.Address, messageToSend *wallet.Message) (*ReceivedMessage, error) {
	sentMessage, block, err := c.SendWaitTransaction(ctx, dstAddr, messageToSend)
	if err != nil {
		return nil, fmt.Errorf("failed to SendWaitTransaction: %w", err)
	}
	err = sentMessage.WaitForTrace(ctx, c.Client)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	master, err := c.Client.WaitForBlock(block.SeqNo).CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	for master.SeqNo <= block.SeqNo+1 {
		time.Sleep(time.Millisecond * 500)
		master, err = c.Client.WaitForBlock(block.SeqNo).CurrentMasterchainInfo(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
		}
	}

	return sentMessage, nil
}
