package indexer

import (
	"context"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
)

var _ logpoller.Indexer = (*indexer)(nil)

type indexer struct {
	lggr    logger.SugaredLogger
	filters logpoller.FilterStore
}

func NewIndexer(lggr logger.Logger, filters logpoller.FilterStore) logpoller.Indexer {
	return &indexer{
		lggr:    logger.Sugared(lggr),
		filters: filters,
	}
}

// IndexTransactions iterates through transactions and processes each one
func (ixr *indexer) IndexTransactions(txs []types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	for _, tx := range txs {
		logs, err := ixr.indexTx(tx)
		if err != nil {
			// TODO: error handling strategy
			ixr.lggr.Errorw("Critical failure indexing transaction, skipping", "tx_hash", tx.Tx.Hash, "err", err)
			continue
		}
		if len(logs) > 0 {
			allLogs = append(allLogs, logs...)
		}
	}

	return allLogs, nil
}

// getSrcAddr inspects the inner message type to reliably get the source address.
func (ixr *indexer) getSrcAddr(msg *tlb.Message) *address.Address {
	switch m := msg.Msg.(type) {
	case *tlb.ExternalMessageOut:
		return m.SrcAddr
	case *tlb.InternalMessage:
		return m.SrcAddr
	default:
		return nil
	}
}

// indexTx handles a single transaction
func (ixr *indexer) indexTx(tx types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	msgs, _ := tx.Tx.IO.Out.ToSlice()
	for _, msg := range msgs {
		srcAddr := ixr.getSrcAddr(&msg)
		if srcAddr == nil {
			continue
		}

		// get filters registered for this source address and message type
		filtersForAddr, err := ixr.filters.GetFiltersForAddressAndMsgType(context.Background(), *srcAddr, msg.MsgType)
		if err != nil {
			ixr.lggr.Errorw("Failed to get filters for address and message type", "addr", srcAddr.String(), "msgType", msg.MsgType, "err", err)
			continue
		}

		if len(filtersForAddr) == 0 {
			continue
		}

		for _, filter := range filtersForAddr {
			var log *types.Log
			var err error

			switch msg.MsgType {
			case tlb.MsgTypeExternalOut:
				log, err = ixr.indexExtMsgOut(msg.AsExternalOut(), filter, tx)
			case tlb.MsgTypeInternal:
				log, err = ixr.indexInternalMsg(msg.AsInternal(), filter, tx)
			case tlb.MsgTypeExternalIn:
				continue // not supported
			}

			if err != nil {
				ixr.lggr.Warnw("Failed to process message with filter", "filterName", filter.Name, "err", err)
				continue
			}

			if log != nil {
				allLogs = append(allLogs, *log)
			}
		}
	}
	return allLogs, nil
}

// indexExtMsgOut creates logs for an external out message.
func (ixr *indexer) indexExtMsgOut(msg *tlb.ExternalMessageOut, filter types.Filter, tx types.TxWithBlock) (*types.Log, error) {
	bucket := event.NewExtOutLogBucket(msg.DstAddr)
	// for ExtMsgOut we use topic for event sig
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		// indexing issue, don't panic
		errLog := ixr.newErrorLog(msg.SrcAddr, msg.Body, tx, fmt.Errorf("failed to decode event topic: %w", err))
		return &errLog, nil
	}

	if topic != filter.EventSig {
		return nil, nil // topic doesn't match this filter's criteria.
	}

	log := types.Log{
		FilterID:    filter.ID,
		EventSig:    topic,
		Address:     msg.SrcAddr,
		Data:        msg.Body,
		TxHash:      types.TxHash(tx.Tx.Hash),
		TxLT:        tx.Tx.LT,
		TxTimestamp: time.Unix(int64(tx.Tx.Now), 0).UTC(),
		Block:       tx.Block,
	}
	return &log, nil
}

func (ixr *indexer) indexInternalMsg(msg *tlb.InternalMessage, filter types.Filter, tx types.TxWithBlock) (*types.Log, error) {
	_ = msg    // TODO: implement internal message processing
	_ = filter // TODO: implement internal message processing
	_ = tx     // TODO: implement internal message processing
	return nil, nil
}

// newErrorLog is a centralized helper for creating logs that represent an indexing error.
func (ixr *indexer) newErrorLog(addr *address.Address, body *cell.Cell, tx types.TxWithBlock, err error) types.Log {
	return types.Log{
		Address:     addr,
		Data:        body,
		TxHash:      types.TxHash(tx.Tx.Hash),
		TxLT:        tx.Tx.LT,
		TxTimestamp: time.Unix(int64(tx.Tx.Now), 0).UTC(),
		Block:       tx.Block,
		Error:       err,
	}
}
