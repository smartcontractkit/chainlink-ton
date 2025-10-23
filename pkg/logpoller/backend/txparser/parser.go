package txparser

import (
	"context"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txparserutils "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.TxParser = (*txParser)(nil)

type txParser struct {
	lggr    logger.SugaredLogger
	filters logpoller.FilterStore
}

func NewTxParser(lggr logger.Logger, filters logpoller.FilterStore) logpoller.TxParser {
	return &txParser{
		lggr:    logger.Sugared(lggr),
		filters: filters,
	}
}

// ParseTransactions iterates through transactions and processes each one
func (p *txParser) ParseTransactions(ctx context.Context, txs []types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	for _, tx := range txs {
		logs, err := p.parseTx(ctx, tx)
		if err != nil {
			// TODO: error handling strategy
			p.lggr.Errorw("Critical failure while parsing transaction, skipping", "tx_hash", tx.Tx.Hash, "err", err)
			continue
		}
		if len(logs) > 0 {
			allLogs = append(allLogs, logs...)
		}
	}

	return allLogs, nil
}

// parseTx handles a single transaction
func (p *txParser) parseTx(ctx context.Context, tx types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	msgs, _ := tx.Tx.IO.Out.ToSlice()
	for _, msg := range msgs {
		srcAddr := msg.Msg.SenderAddr()

		// get filters registered for this source address and message type
		filtersForAddr, err := p.filters.GetFiltersForAddressAndMsgType(ctx, srcAddr, msg.MsgType)
		if err != nil {
			p.lggr.Errorw("Failed to get filters for address and message type", "addr", srcAddr.String(), "msgType", msg.MsgType, "err", err)
			continue
		}

		if len(filtersForAddr) == 0 {
			continue
		}

		for _, filter := range filtersForAddr {
			var eventSig uint32
			var body *cell.Cell
			var err error

			switch msg.MsgType {
			case tlb.MsgTypeExternalOut:
				eventSig, body, err = txparserutils.ParseExtMsgOut(msg.AsExternalOut())
			case tlb.MsgTypeInternal:
				eventSig, body, err = txparserutils.ParseInternalMsg(msg.AsInternal())
			case tlb.MsgTypeExternalIn:
				continue // not supported
			}

			if err != nil {
				p.lggr.Warnw("Failed to process message with filter", "filterName", filter.Name, "err", err)
				continue
			}

			if body != nil && eventSig != 0 {
				log := types.Log{
					FilterID:    filter.ID,
					EventSig:    eventSig,
					Address:     srcAddr, // source address of the internal message
					Data:        body,    // full message body as data
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
