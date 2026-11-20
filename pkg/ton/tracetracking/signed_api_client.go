package tracetracking

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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

// liteserverCodeExternalMessageRejected is the liteserver error code for an external message the
// account did not accept.
const liteserverCodeExternalMessageRejected = -701

// IsInboundExternalMessageRejectedByAccountError reports whether err carries the liteserver's
// rejection of an external message by the account it was sent to. Only sending a message returns
// that code, and SendExternalWaitTransaction reports only the error of its call's first send, so
// for its errors a match means that send was rejected.
func IsInboundExternalMessageRejectedByAccountError(err error) bool {
	var lsErr ton.LSError
	return errors.As(err, &lsErr) && lsErr.Code == liteserverCodeExternalMessageRejected
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

// FindExternalTransaction looks for the wallet transaction that processed ext among the wallet's
// transactions made at or after `after`, as of the latest masterchain block the node knows.
//
// It also returns coveredUntil, the time of the block holding the wallet's state in that view.
// Every wallet transaction made in an earlier block was checked, so a nil transaction with no
// error means ext was not processed in any block made before coveredUntil. A lagging node gives
// an earlier coveredUntil rather than a wrong answer.
func (c *SignedAPIClient) FindExternalTransaction(ctx context.Context, ext *tlb.ExternalMessage, after time.Time) (found *ReceivedMessage, coveredUntil time.Time, err error) {
	master, err := c.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to get masterchain info: %w", err)
	}
	api := c.Client.WaitForBlock(master.SeqNo)

	coveredUntil, err = accountBlockTime(ctx, c.Client, master, ext.DstAddr)
	if err != nil {
		return nil, time.Time{}, err
	}
	acc, err := api.GetAccount(ctx, master, ext.DstAddr)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to get account %s: %w", ext.DstAddr, err)
	}

	tx, err := findInboundExternal(ctx, api, acc, ext.DstAddr, ext.NormalizedHash(), after)
	if err != nil {
		return nil, time.Time{}, err
	}
	if tx == nil {
		return nil, coveredUntil, nil
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	return &receivedMessage, coveredUntil, nil
}

// accountBlockTime returns the time of the block holding addr's state as of the masterchain
// block master: the shard block master references for addr, or master itself for a
// masterchain address.
func accountBlockTime(ctx context.Context, client ton.APIClientWrapped, master *ton.BlockIDExt, addr *address.Address) (time.Time, error) {
	// a node that has master also has the shard blocks it references
	api := client.WaitForBlock(master.SeqNo)
	block := master
	if addr.Workchain() != address.MasterchainID {
		shards, err := api.GetBlockShardsInfo(ctx, master)
		if err != nil {
			return time.Time{}, fmt.Errorf("failed to get shards of masterchain block %d: %w", master.SeqNo, err)
		}
		block = nil
		for _, shard := range shards {
			if shard.Workchain == addr.Workchain() && tlb.ShardID(uint64(shard.Shard)).ContainsAddress(addr) { //nolint:gosec // shard ids are bit patterns
				block = shard
				break
			}
		}
		if block == nil {
			return time.Time{}, fmt.Errorf("masterchain block %d has no shard for %s", master.SeqNo, addr)
		}
	}

	header, err := api.GetBlockHeader(ctx, block)
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to get header of block %d: %w", block.SeqNo, err)
	}
	return time.Unix(int64(header.GenUtime), 0), nil
}

// findInboundExternal scans addr's transactions from acc's last one back to the first made
// before `after`, and returns the one whose inbound external message has the normalized hash
// msgHash, or nil if there is none.
func findInboundExternal(ctx context.Context, api ton.APIClientWrapped, acc *tlb.Account, addr *address.Address, msgHash []byte, after time.Time) (*tlb.Transaction, error) {
	if !acc.IsActive {
		return nil, nil // an account that does not exist has processed no messages
	}

	lt, hash := acc.LastTxLT, acc.LastTxHash
	for lt != 0 {
		// newest last, and never empty: a transaction the node no longer has is reported as an
		// error (ton.ErrNoTransactionsWereFound)
		txs, err := api.ListTransactions(ctx, addr, 15, lt, hash)
		if err != nil {
			return nil, fmt.Errorf("failed to list transactions of %s from lt %d: %w", addr, lt, err)
		}
		for i := len(txs) - 1; i >= 0; i-- {
			tx := txs[i]
			if int64(tx.Now) < after.Unix() {
				return nil, nil
			}
			if isInboundExternal(tx, msgHash) {
				return tx, nil
			}
		}
		lt, hash = txs[0].PrevTxLT, txs[0].PrevTxHash
	}
	return nil, nil
}

func isInboundExternal(tx *tlb.Transaction, msgHash []byte) bool {
	if tx.IO.In == nil || tx.IO.In.MsgType != tlb.MsgTypeExternalIn {
		return false
	}
	in, ok := tx.IO.In.Msg.(*tlb.ExternalMessageIn)
	return ok && bytes.Equal(in.NormalizedHash(), msgHash)
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
