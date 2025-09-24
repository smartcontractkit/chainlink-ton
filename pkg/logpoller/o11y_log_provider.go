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

var _ RawLogProvider = (*tonO11yLogProvider)(nil)

type tonO11yLogProvider struct {
	client ton.APIClientWrapped
	loader TxLoader
}

// NewLogReader creates a new LogReader instance.
func NewTonO11yLogProvider(client ton.APIClientWrapped, loader TxLoader) RawLogProvider {
	return &tonO11yLogProvider{
		client: client,
		loader: loader,
	}
}

// GetLogs retrieves all ExternalMsgOutLogs for an address between fromBlockSeqNo (exclusive) and toBlock (inclusive).
func (tlp *tonO11yLogProvider) GetLogs(ctx context.Context, addr *address.Address, from uint32, to *ton.BlockIDExt) ([]types.RawLog, error) {
	// No new logs to fetch
	if to.SeqNo <= from {
		return nil, nil
	}

	// Resolve previous block if exists
	var prevBlock *ton.BlockIDExt
	var err error
	if from == 0 {
		prevBlock = nil // genesis has no prevBlock
	} else {
		prevBlock, err = tlp.client.LookupBlock(ctx, to.Workchain, to.Shard, from)
		if err != nil {
			return nil, fmt.Errorf("failed to lookup block for address=%s, fromSeqNo=%d: %w", addr.String(), from, err)
		}
	}

	// Fetch tx for address on given blockRange
	blockRange := &types.BlockRange{Prev: prevBlock, To: to}
	txs, err := tlp.loader.FetchTxsForAddress(ctx, blockRange, addr)
	if err != nil {
		// display "genesis" if nil and don't panic
		fromSeqNoStr := "genesis"
		if prevBlock != nil {
			fromSeqNoStr = strconv.FormatUint(uint64(prevBlock.SeqNo), 10)
		}

		return nil, fmt.Errorf("failed to fetch transactions fromSeqNo=%s, toSeqNo=%d: %w", fromSeqNoStr, to.SeqNo, err)
	}

	// Extract only externalMsgOut logs that we found in all these txes.
	logs, err := tlp.extractExternalMsgOutLogs(ctx, txs)
	if err != nil {
		return nil, fmt.Errorf("failed to extract logs for address=%s: %w", addr.String(), err)
	}

	return logs, nil
}

func (tlp *tonO11yLogProvider) extractExternalMsgOutLogs(ctx context.Context, txs []types.TxWithBlock) ([]types.RawLog, error) {
	var allLogs []types.RawLog

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

			extMsg := msg.AsExternalOut()

			// Fail hard so we don't skip events. We want at-least-once delivery guarantees on events
			eventSig, body, err := txparserUtils.ParseExtMsgOut(extMsg)
			if err != nil {
				return nil, fmt.Errorf("failed to parse external message out for txHash=%v, LT=%d: %w", tx.Tx.Hash, tx.Tx.LT, err)
			}

			// If we got a valid event and body
			if body != nil && eventSig != 0 {
				log := types.RawLog{
					Tx:    tx.Tx,
					Block: blockData,
					Data:  body,
					Topic: eventSig,
				}
				allLogs = append(allLogs, log)
			}
		}
	}

	return allLogs, nil
}
