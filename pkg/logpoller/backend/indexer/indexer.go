package indexer

import (
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

// IndexTransactions iterates through external messages and processes each one
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

// Process handles a single external message:
// 1. Extracts event topic from destination address
// 2. Finds matching filters for the source address and topic
// 3. return indexed logs for each matching filter
func (ixr *indexer) indexTx(tx types.TxWithBlock) ([]types.Log, error) {
	var txLogs []types.Log

	msgs, _ := tx.Tx.IO.Out.ToSlice()
	for _, msg := range msgs {
		var newLogs []types.Log
		var err error

		switch msg.MsgType {
		case tlb.MsgTypeExternalOut:
			// non-critical errors are returned within the logs themselves.
			// a non-nil 'err' here would be a critical, unexpected error.
			newLogs, err = ixr.indexExtMsgOut(msg.AsExternalOut(), tx)
		case tlb.MsgTypeInternal:
			newLogs, err = ixr.indexInternalMsg(msg.AsInternal(), tx)
		case tlb.MsgTypeExternalIn:
			continue // not supported
		default:
			continue // not supported
		}

		if err != nil {
			// a critical error occurred. Stop processing this transaction's messages.
			return nil, fmt.Errorf("failed to process message: %w", err)
		}

		if len(newLogs) > 0 {
			txLogs = append(txLogs, newLogs...)
		}
	}

	return txLogs, nil
}

// indexExtMsgOut creates logs for an external out message.
func (ixr *indexer) indexExtMsgOut(msg *tlb.ExternalMessageOut, tx types.TxWithBlock) ([]types.Log, error) {
	bucket := event.NewExtOutLogBucket(msg.DstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		// indexing issue, don't panic
		errLog := ixr.newErrorLog(msg.SrcAddr, msg.Body, tx, fmt.Errorf("failed to decode event topic: %w", err))
		return []types.Log{errLog}, nil
	}

	fIDs, err := ixr.filters.MatchingFilters(*msg.SrcAddr, topic)
	if err != nil {
		// can be a timeout or connection issue
		return nil, fmt.Errorf("failed to get matching filters: %w", err)
	}
	if len(fIDs) == 0 {
		return nil, nil // no filters matched, nothing to do
	}

	// there can be multiple filters matching, need to produce corresponding number of logs
	logs := make([]types.Log, 0, len(fIDs))
	for _, fid := range fIDs {
		log := types.Log{
			FilterID:    fid,
			EventSig:    topic,
			Address:     msg.SrcAddr,
			Data:        msg.Body,
			TxHash:      types.TxHash(tx.Tx.Hash),
			TxLT:        tx.Tx.LT,
			TxTimestamp: time.Unix(int64(tx.Tx.Now), 0).UTC(),
			Block:       tx.Block,
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (ixr *indexer) indexInternalMsg(msg *tlb.InternalMessage, tx types.TxWithBlock) ([]types.Log, error) {
	_ = msg // TODO: implement internal message processing
	_ = tx  // TODO: implement internal message processing
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
