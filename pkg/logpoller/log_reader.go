package logpoller

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	txparserUtils "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ LogReader = (*logReader)(nil)

type logReader struct {
	client ton.APIClientWrapped
	lggr   logger.Logger
	loader TxLoader
}

// NewLogReader creates a new LogReader instance.
func NewLogReader(client ton.APIClientWrapped, lggr logger.Logger, loader TxLoader) LogReader {
	return &logReader{
		client: client,
		lggr:   lggr,
		loader: loader,
	}
}

// GetLogs retrieves all ExternalMsgOutLogs for an address between fromBlockSeqNo (exclusive) and toBlock (inclusive).
func (lr *logReader) GetLogs(ctx context.Context, addr *address.Address, fromBlockSeqNo uint32, toBlock *ton.BlockIDExt) ([]types.Log, error) {
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
		prevBlock, err = lr.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, fromBlockSeqNo)
		if err != nil {
			return nil, fmt.Errorf("failed to lookup block for address=%s, fromSeqNo=%d: %w", addr.String(), fromBlockSeqNo, err)
		}
	}

	// Fetch tx for address on given blockRange
	blockRange := &types.BlockRange{Prev: prevBlock, To: toBlock}
	txs, err := lr.loader.FetchTxsForAddress(ctx, blockRange, addr)
	if err != nil {
		// display "genesis" if nil and don't panic
		fromSeqNoStr := "genesis"
		if prevBlock != nil {
			fromSeqNoStr = strconv.FormatUint(uint64(prevBlock.SeqNo), 10)
		}

		return nil, fmt.Errorf("failed to fetch transactions fromSeqNo=%s, toSeqNo=%d: %w", fromSeqNoStr, toBlock.SeqNo, err)
	}

	// Extract only externalMsgOut logs that we found in all these txes.
	logs, err := lr.extractExternalMsgOutLogs(txs)
	if err != nil {
		return nil, fmt.Errorf("failed to extract logs for address=%s: %w", addr.String(), err)
	}

	return logs, nil
}

func (lr *logReader) extractExternalMsgOutLogs(txs []types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	for _, tx := range txs {
		msgs, _ := tx.Tx.IO.Out.ToSlice()
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
				log := types.Log{
					EventSig:    eventSig,
					Address:     srcAddr,
					Data:        body,
					TxHash:      types.TxHash(tx.Tx.Hash),
					TxLT:        tx.Tx.LT,
					TxTimestamp: time.Unix(int64(tx.Tx.Now), 0).UTC(),
					Block:       tx.Block,
				}

				allLogs = append(allLogs, log)
			}
		}
	}

	return allLogs, nil
}
