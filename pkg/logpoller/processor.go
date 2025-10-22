package logpoller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/message"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// ProcessTx handles a single transaction
func (lp *service) ProcessTx(ctx context.Context, tx *tlb.Transaction, block *ton.BlockIDExt, chainID string, filterIndex models.FilterIndex) ([]models.Log, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}

	if tx.IO.Out == nil {
		// this should never happen, since we filter out transactions without output messages in the loader
		return nil, errors.New("transaction has no output messages")
	}

	var allLogs []models.Log

	msgs, err := tx.IO.Out.ToSlice()
	if err != nil {
		return nil, fmt.Errorf("failed to extract messages from transaction: %w", err)
	}

	for msgIndex, msg := range msgs {
		logs, err := lp.processMessage(ctx, tx, block, chainID, msgIndex, &msg, filterIndex)
		if err != nil {
			// Critical structural error - skip message, log error
			lp.lggr.Errorw("critical error processing message, skipping", "tx_hash", tx.Hash, "msgIndex", msgIndex, "err", err)
			continue
		}
		allLogs = append(allLogs, logs...)
	}
	return allLogs, nil
}

// processMessage handles a single message within a transaction
func (lp *service) processMessage(_ context.Context, tx *tlb.Transaction, block *ton.BlockIDExt, chainID string, msgIndex int, msg *tlb.Message, filterIndex models.FilterIndex) ([]models.Log, error) {
	// guard clauses for initial validation and early exit
	if msg == nil || msg.Msg == nil {
		return nil, errors.New("message or message content is nil")
	}

	// attempt to extract the event data
	eventSig, body, err := extractEventSigAndBody(msg)
	if err != nil {
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

	// Find matching filters using Equal method
	var filterIDs []int64
	for key, ids := range filterIndex {
		if key.Equal(filterKey) {
			filterIDs = ids
			break
		}
	}

	if len(filterIDs) == 0 {
		return []models.Log{}, nil // no matching filters found
	}

	// create logs with the found filterIDs
	logs := make([]models.Log, len(filterIDs))
	for i, filterID := range filterIDs {
		msgLT, err := extractMsgLT(msg)
		if err != nil {
			return nil, fmt.Errorf("failed to extract msgLT: %w", err)
		}
		logs[i] = models.Log{
			ChainID:          chainID,
			FilterID:         filterID,
			EventSig:         eventSig,
			Address:          msg.Msg.SenderAddr(),
			Data:             body,
			TxHash:           models.TxHash(tx.Hash),
			TxLT:             tx.LT,
			TxTimestamp:      time.Unix(int64(tx.Now), 0).UTC(),
			Block:            block,
			MasterBlockSeqno: 0, // TODO: populate MasterBlockSeqno
			MsgLT:            msgLT,
			MsgIndex:         int64(msgIndex),
			// TODO: populate Error field for failed message processing
			// scope: structural validation errors (nil message/content)
			// scope: event extraction errors (BOC decode failures, unsupported message types)
			// currently handled by returning error from processMessage, but error logs not stored
			Error: nil,
		}
	}
	return logs, nil
}

func extractEventSigAndBody(msg *tlb.Message) (eventSig uint32, body *cell.Cell, err error) {
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

func extractMsgLT(msg *tlb.Message) (uint64, error) {
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
