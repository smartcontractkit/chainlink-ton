package logpoller

import (
	"context"
	"fmt"
	"strconv"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	txparserUtils "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ O11yLogProvider = (*tonO11yLogProvider)(nil)

type tonO11yLogProvider struct {
	client ton.APIClientWrapped
	loader TxLoader
}

// NewLogReader creates a new LogReader instance.
func NewTonO11yLogProvider(client ton.APIClientWrapped, loader TxLoader) O11yLogProvider {
	return &tonO11yLogProvider{
		client: client,
		loader: loader,
	}
}

// GetLogs retrieves all ExternalMsgOutLogs for an address between fromBlockSeqNo (exclusive) and toBlock (inclusive).
func (tlp *tonO11yLogProvider) GetLogs(ctx context.Context, addr, from, to any) ([]types.O11yLog, error) {
	// Type assertions for TON-specific types
	addrTyped, ok := addr.(*address.Address)
	if !ok {
		return nil, fmt.Errorf("expected addr to be *address.Address, got %T", addr)
	}

	fromBlockSeqNo, ok := from.(uint32)
	if !ok {
		return nil, fmt.Errorf("expected from to be uint32, got %T", from)
	}

	toBlock, ok := to.(*ton.BlockIDExt)
	if !ok {
		return nil, fmt.Errorf("expected to to be *ton.BlockIDExt, got %T", to)
	}

	// No new logs to fetch
	if toBlock.SeqNo <= fromBlockSeqNo {
		return nil, nil
	}

	// Resolve previous block if exists
	var prevBlock *ton.BlockIDExt
	var err error
	if fromBlockSeqNo == 0 {
		prevBlock = nil // genesis has no prevBlock
	} else {
		prevBlock, err = tlp.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, fromBlockSeqNo)
		if err != nil {
			return nil, fmt.Errorf("failed to lookup block for address=%s, fromSeqNo=%d: %w", addrTyped.String(), fromBlockSeqNo, err)
		}
	}

	// Fetch tx for address on given blockRange
	blockRange := &types.BlockRange{Prev: prevBlock, To: toBlock}
	txs, err := tlp.loader.FetchTxsForAddress(ctx, blockRange, addrTyped)
	if err != nil {
		// display "genesis" if nil and don't panic
		fromSeqNoStr := "genesis"
		if prevBlock != nil {
			fromSeqNoStr = strconv.FormatUint(uint64(prevBlock.SeqNo), 10)
		}

		return nil, fmt.Errorf("failed to fetch transactions fromSeqNo=%s, toSeqNo=%d: %w", fromSeqNoStr, toBlock.SeqNo, err)
	}

	// Extract only externalMsgOut logs that we found in all these txes.
	logs, err := tlp.extractExternalMsgOutLogs(ctx, txs)
	if err != nil {
		return nil, fmt.Errorf("failed to extract logs for address=%s: %w", addrTyped.String(), err)
	}

	return logs, nil
}

func (tlp *tonO11yLogProvider) extractExternalMsgOutLogs(ctx context.Context, txs []types.TxWithBlock) ([]types.O11yLog, error) {
	var allLogs []types.O11yLog

	for _, tx := range txs {
		msgs, _ := tx.Tx.IO.Out.ToSlice()

		blockData, err := tlp.client.GetBlockData(ctx, tx.Block)
		if err != nil {
			return nil, err
		}

		for _, msg := range msgs {
			// Skip any message that's not an external out message
			if msg.MsgType != tlb.MsgTypeExternalOut {
				continue
			}

			srcAddr := msg.Msg.SenderAddr()
			extMsg := msg.AsExternalOut()

			// Fail hard so we don't skip events. We want at-least-once delivery guarantees on events
			eventSig, body, err := txparserUtils.ParseExtMsgOut(extMsg)
			if err != nil {
				return nil, fmt.Errorf("failed to parse external message out for txHash=%v, LT=%d: %w", tx.Tx.Hash, tx.Tx.LT, err)
			}

			// If we got a valid event and body
			if body != nil && eventSig != 0 {
				log := types.O11yLog{
					Address: srcAddr.String(),
					From:    tx.Tx.IO.In.AsInternal().SrcAddr.String(),

					TransactionHash:  fmt.Sprintf("%x", tx.Tx.Hash),
					TransactionIndex: fmt.Sprintf("%d", tx.Tx.LT),
					Topics:           []string{fmt.Sprintf("%d", eventSig)},
					Data:             fmt.Sprintf("0x%x", body.ToBOC()), // as hex

					BlockTimestamp: fmt.Sprintf("%d", blockData.BlockInfo.GenUtime),
					BlockNumber:    fmt.Sprintf("%d", blockData.BlockInfo.SeqNo),
					BlockHash:      fmt.Sprintf("%x", blockData.BlockInfo.MasterRef.RootHash),
					LogIndex:       fmt.Sprintf("%d", 0),
					ChainId:        "",    // TODO: Ask how to obtain this info from logs
					Removed:        false, // no reorgs
					Success:        true,  // TODO: Determine what we'll do here with errors
				}

				allLogs = append(allLogs, log)
			}
		}
	}

	return allLogs, nil
}
