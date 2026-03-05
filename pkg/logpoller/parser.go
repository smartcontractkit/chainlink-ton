package logpoller

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/message"
)

// msgTypeLabels maps MsgType to pre-computed lowercase strings for metrics.
var msgTypeLabels = map[tlb.MsgType]string{
	tlb.MsgTypeInternal:    "internal",
	tlb.MsgTypeExternalIn:  "external_in",
	tlb.MsgTypeExternalOut: "external_out",
}

// parseTransactions spawns goroutines to parse transactions in parallel.
// Performance Note: consider worker pool if transaction volume becomes high (>1000/block)
func (lp *service) parseTransactions(
	ctx context.Context,
	filterIndex models.FilterIndex,
	chainID string,
	txsIn <-chan models.Tx,
) (<-chan models.Log, <-chan error) {
	logsOut := make(chan models.Log, lp.saveThreshold)
	errsOut := make(chan error)

	var wg sync.WaitGroup

	go func() {
		for tx := range txsIn {
			lp.metrics.IncrementTxsProcessed(ctx)
			wg.Go(func() {
				logs, err := lp.parseTx(ctx, tx, chainID, filterIndex)
				if err != nil {
					errsOut <- fmt.Errorf("failed to process tx %x: %w", tx.Transaction.Hash, err)
					return
				}

				for _, log := range logs {
					select {
					case logsOut <- log:
					case <-ctx.Done():
						return
					}
				}
			})
		}
		wg.Wait()

		close(logsOut)
		close(errsOut)
	}()

	return logsOut, errsOut
}

// parseTx handles a single transaction
func (lp *service) parseTx(ctx context.Context, tx models.Tx, chainID string, filterIndex models.FilterIndex) ([]models.Log, error) {
	if tx.Transaction == nil {
		return nil, errors.New("transaction is nil")
	}

	// validate block metadata is present - required for log storage
	if tx.Block == nil {
		return nil, errors.New("block is nil")
	}

	if tx.Transaction.IO.Out == nil {
		// this should never happen, since we filter out transactions without output messages in the loader
		return nil, errors.New("transaction has no output messages")
	}

	var allLogs []models.Log

	msgs, err := tx.Transaction.IO.Out.ToSlice()
	if err != nil {
		return nil, fmt.Errorf("failed to extract messages from transaction: %w", err)
	}

	for msgIndex, msg := range msgs {
		logs, err := lp.parseMessage(ctx, &msg, msgIndex, tx, chainID, filterIndex)
		if err != nil {
			// Critical structural error - skip message, log error
			lp.lggr.Errorw("failed to parse message, skipping", "tx_hash", tx.Transaction.Hash, "msgIndex", msgIndex, "err", err)
			lp.metrics.IncrementParseErrors(ctx)
			continue
		}
		allLogs = append(allLogs, logs...)
	}
	return allLogs, nil
}

// parseMessage handles a single message within a transaction
func (lp *service) parseMessage(ctx context.Context, msg *tlb.Message, msgIndex int, tx models.Tx, chainID string, filterIndex models.FilterIndex) ([]models.Log, error) {
	// guard clauses for initial validation and early exit
	if msg == nil || msg.Msg == nil {
		return nil, errors.New("message or message content is nil")
	}

	// Only process supported message types - silently skip others (e.g., ExternalIn)
	if msg.MsgType != tlb.MsgTypeInternal && msg.MsgType != tlb.MsgTypeExternalOut {
		return []models.Log{}, nil
	}

	// Extract event data - errors here indicate parse failures on supported types
	eventSig, body, err := extractEventSigAndBody(msg)
	if err != nil {
		return nil, fmt.Errorf("event extraction failed: %w", err)
	}

	// derive metric label
	opcodeLabel := fmt.Sprintf("0x%08x", eventSig)

	// record message processed metric
	lp.metrics.IncrementMsgsProcessed(ctx, msgTypeLabels[msg.MsgType], opcodeLabel)

	// skip messages that aren't valid, parseable events
	if body == nil || eventSig == 0 {
		return []models.Log{}, nil
	}

	// find matching filters for the event
	filterKey := models.FilterKey{
		Address:  msg.Msg.SenderAddr(),
		MsgType:  msg.MsgType,
		EventSig: eventSig,
	}

	filters := filterIndex[filterKey.String()]
	if len(filters) == 0 {
		return []models.Log{}, nil // no matching filters found
	}

	// record logs matched metric
	lp.metrics.AddLogsMatched(ctx, msgTypeLabels[msg.MsgType], opcodeLabel, int64(len(filters)))

	msgLT, err := extractMsgLT(msg)
	if err != nil {
		// This should never happen - msgLT is a protocol field that should always be available
		// after successful event extraction. Treat as critical error.
		return nil, fmt.Errorf("failed to extract msgLT: %w", err)
	}

	// create a log entry for each matching filter
	// DB unique constraint (chain_id, filter_id, tx_hash, tx_lt, msg_index) allows multiple filters
	// to store the same blockchain event. Query-time deduplication handles returning unique events.
	logs := make([]models.Log, 0, len(filters))
	for _, filter := range filters {
		logs = append(logs, lp.newLog(chainID, filter, msg, msgIndex, tx, eventSig, body, msgLT))
	}
	return logs, nil
}

// newLog creates a models.Log with common field population.
func (lp *service) newLog(
	chainID string,
	filter *models.Filter,
	msg *tlb.Message,
	msgIndex int,
	tx models.Tx,
	eventSig uint32,
	body *cell.Cell,
	msgLT uint64,
) models.Log {
	txTimestamp := time.Unix(int64(tx.Transaction.Now), 0).UTC()

	var expiresAt *time.Time
	if filter.LogRetention > 0 {
		exp := txTimestamp.Add(filter.LogRetention)
		expiresAt = &exp
	}

	return models.Log{
		ChainID:      chainID,
		FilterID:     filter.ID,
		EventSig:     eventSig,
		Address:      msg.Msg.SenderAddr(),
		Data:         body,
		TxHash:       models.TxHash(tx.Transaction.Hash),
		TxLT:         tx.Transaction.LT,
		TxTimestamp:  txTimestamp,
		Block:        tx.Block,
		MCBlockSeqno: tx.MCBlockSeqno,
		MsgLT:        msgLT,
		MsgIndex:     int64(msgIndex),
		ExpiresAt:    expiresAt,
	}
}

func extractEventSigAndBody(msg *tlb.Message) (eventSig uint32, body *cell.Cell, err error) {
	switch msg.MsgType {
	case tlb.MsgTypeInternal:
		return message.ParseInternalMsg(msg.AsInternal())
	case tlb.MsgTypeExternalOut:
		return message.ParseExtMsgOut(msg.AsExternalOut())
	default:
		// Caller should filter message types before calling
		return 0, nil, fmt.Errorf("unexpected message type: %v", msg.MsgType)
	}
}

func extractMsgLT(msg *tlb.Message) (uint64, error) {
	switch msg.MsgType {
	case tlb.MsgTypeInternal:
		if internal := msg.AsInternal(); internal != nil {
			return internal.CreatedLT, nil
		}
		return 0, errors.New("internal message is nil")
	case tlb.MsgTypeExternalOut:
		if extOut := msg.AsExternalOut(); extOut != nil {
			return extOut.CreatedLT, nil
		}
		return 0, errors.New("external out message is nil")
	default:
		// Caller should filter message types before calling
		return 0, fmt.Errorf("unexpected message type: %v", msg.MsgType)
	}
}
