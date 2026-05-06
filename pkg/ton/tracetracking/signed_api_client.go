package tracetracking

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
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

type WalletTXError struct {
	Err         error
	Destination address.Address
}

var (
	_ error = (*WalletTXError)(nil)
)

func (e *WalletTXError) Error() string {
	return fmt.Sprintf("wallet transaction error for destination %s: %v", e.Destination.String(), e.Err)
}

func (e *WalletTXError) Unwrap() error {
	return e.Err
}

func (e *WalletTXError) IsInboundExternalMessageRejectedByAccountError() bool {
	const errPrefix = "failed to send message: lite server error, code -701"
	return strings.HasPrefix(e.Err.Error(), errPrefix)
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
		return nil, nil, &WalletTXError{Err: err, Destination: dstAddr}
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	return &receivedMessage, block, nil
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
