package processor

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/message"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ logpoller.Processor = (*txProcessor)(nil)

type txProcessor struct {
	lggr    logger.SugaredLogger
	chainID string
}

func New(lggr logger.Logger, chainID string) logpoller.Processor {
	return &txProcessor{
		lggr:    logger.Sugared(lggr),
		chainID: chainID,
	}
}

// ProcessTransactions iterates through transactions and processes each one
func (p *txProcessor) ProcessTransactions(ctx context.Context, txs []*tlb.Transaction, blocks []*ton.BlockIDExt, filterIndex models.FilterIndex) ([]models.Log, error) {
	if len(txs) != len(blocks) {
		return nil, fmt.Errorf("transaction and block slices must have the same length: txs=%d, blocks=%d", len(txs), len(blocks))
	}

	var allLogs []models.Log

	p.lggr.Debugw("processor starting", "txCount", len(txs), "filterIndexKeys", len(filterIndex))

	for i, tx := range txs {
		logs, err := p.processTx(ctx, tx, blocks[i], filterIndex)
		if err != nil {
			// TODO: processing error, skip transaction. should be monitored
			p.lggr.Errorw("failure while processing transaction, skipping", "tx_hash", tx.Hash, "err", err)
			continue
		}

		p.lggr.Debugw("processed transaction", "txIndex", i, "txHash", tx.Hash, "logsGenerated", len(logs))

		if len(logs) > 0 {
			allLogs = append(allLogs, logs...)
		}
	}

	p.lggr.Debugw("processor completed", "totalLogs", len(allLogs))
	return allLogs, nil
}

// processTx handles a single transaction
func (p *txProcessor) processTx(_ context.Context, tx *tlb.Transaction, block *ton.BlockIDExt, filterIndex models.FilterIndex) ([]models.Log, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}

	var allLogs []models.Log

	msgs, err := tx.IO.Out.ToSlice()
	if err != nil {
		return nil, fmt.Errorf("failed to extract messages from transaction: %w", err)
	}

	for msgIndex, msg := range msgs {
		logs, err := p.processMessage(tx, block, msgIndex, &msg, filterIndex)
		if err != nil {
			// Critical structural error - skip message, log error
			p.lggr.Errorw("critical error processing message, skipping", "tx_hash", tx.Hash, "msgIndex", msgIndex, "err", err)
			continue
		}
		allLogs = append(allLogs, logs...)
	}
	return allLogs, nil
}

// processMessage handles a single message within a transaction
func (p *txProcessor) processMessage(tx *tlb.Transaction, block *ton.BlockIDExt, msgIndex int, msg *tlb.Message, filterIndex models.FilterIndex) ([]models.Log, error) {
	// guard clauses for initial validation and early exit
	if msg == nil || msg.Msg == nil {
		return nil, errors.New("message or message content is nil")
	}

	// attempt to extract the event data
	eventSig, body, err := p.extractEventSigAndBody(msg)
	if err != nil {
		p.lggr.Warnw("Failed to extract event from message", "msgType", msg.MsgType, "err", err)
		return nil, fmt.Errorf("event extraction failed: %w", err)
	}

	// skip messages that aren't valid, parseable events
	if body == nil || eventSig == 0 {
		return []models.Log{}, nil
	}

	// find matching filters for the event
	srcAddr := msg.Msg.SenderAddr()
	filterKey := models.FilterKey{
		Address:  srcAddr,
		MsgType:  msg.MsgType,
		EventSig: eventSig,
	}

	p.lggr.Debugw("looking for filter match",
		"address", srcAddr.String(),
		"msgType", msg.MsgType,
		"eventSig", eventSig,
		"filterKey", filterKey)

	// Find matching filters using Equal method
	var filterIDs []int64
	for key, ids := range filterIndex {
		if key.Equal(filterKey) {
			filterIDs = ids
			break
		}
	}
	p.lggr.Debugw("filter lookup result", "matchingFilters", len(filterIDs), "filterIDs", filterIDs)

	if len(filterIDs) == 0 {
		return []models.Log{}, nil // no matching filters found
	}

	// create logs with the found filterIDs
	logs := make([]models.Log, len(filterIDs))
	for i, filterID := range filterIDs {
		msgLT, err := p.extractMsgLT(msg)
		if err != nil {
			return nil, fmt.Errorf("failed to extract msgLT: %w", err)
		}
		logs[i] = models.Log{
			FilterID:    filterID,
			ChainID:     p.chainID,
			EventSig:    eventSig,
			Address:     msg.Msg.SenderAddr(),
			Data:        body,
			TxHash:      models.TxHash(tx.Hash),
			TxLT:        tx.LT,
			TxTimestamp: time.Unix(int64(tx.Now), 0).UTC(),
			Block:       block,
			MsgLT:       msgLT,
			MsgIndex:    int64(msgIndex),
			// TODO: populate Error field for failed message processing
			// scope: structural validation errors (nil message/content)
			// scope: event extraction errors (BOC decode failures, unsupported message types)
			// currently handled by returning error from processMessage, but error logs not stored
			Error: nil,
		}
	}
	return logs, nil
}

func (p *txProcessor) extractMsgLT(msg *tlb.Message) (uint64, error) {
	switch msg.MsgType {
	default:
		return 0, fmt.Errorf("unsupported message type: %v", msg.MsgType)
	case tlb.MsgTypeInternal:
		if internal := msg.AsInternal(); internal != nil {
			return internal.CreatedLT, nil
		}
	case tlb.MsgTypeExternalOut:
		if extOut := msg.AsExternalOut(); extOut != nil {
			return extOut.CreatedLT, nil
		}
	}
	return 0, fmt.Errorf("unsupported message type: %v", msg.MsgType)
}

func (p *txProcessor) extractEventSigAndBody(msg *tlb.Message) (eventSig uint32, body *cell.Cell, err error) {
	switch msg.MsgType {
	default:
		return 0, nil, fmt.Errorf("unsupported message type: %v", msg.MsgType)
	case tlb.MsgTypeExternalOut:
		eventSig, body, err = message.ParseExtMsgOut(msg.AsExternalOut())
		if err != nil {
			return 0, nil, fmt.Errorf("failed to parse external out message: %w", err)
		}
		return eventSig, body, nil
	case tlb.MsgTypeInternal:
		eventSig, body, err = message.ParseInternalMsg(msg.AsInternal())
		if err != nil {
			return 0, nil, fmt.Errorf("failed to parse internal message: %w", err)
		}
		return eventSig, body, nil
	}
}
