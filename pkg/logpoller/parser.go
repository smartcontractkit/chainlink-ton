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
// TODO: consider worker pool if transaction volume becomes high (>1000/block)
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
			lp.lggr.Errorw("critical error processing message, skipping", "tx_hash", tx.Transaction.Hash, "msgIndex", msgIndex, "err", err)
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

	// attempt to extract the event data
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

	filterIDs := filterIndex[filterKey.String()]
	if len(filterIDs) == 0 {
		return []models.Log{}, nil // no matching filters found
	}

	// record logs matched metric
	lp.metrics.AddLogsMatched(ctx, msgTypeLabels[msg.MsgType], opcodeLabel, int64(len(filterIDs)))

	msgLT, err := extractMsgLT(msg)
	if err != nil {
		return nil, fmt.Errorf("failed to extract msgLT: %w", err)
	}

	// create a log entry for each matching filter.
	// DB unique constraint (chain_id, filter_id, tx_hash, tx_lt, msg_index) allows multiple filters
	// to store the same blockchain event. Query-time deduplication handles returning unique events.
	logs := make([]models.Log, 0, len(filterIDs))
	for _, filterID := range filterIDs {
		log := models.Log{
			ChainID:      chainID,
			FilterID:     filterID,
			EventSig:     eventSig,
			Address:      msg.Msg.SenderAddr(),
			Data:         body,
			TxHash:       models.TxHash(tx.Transaction.Hash),
			TxLT:         tx.Transaction.LT,
			TxTimestamp:  time.Unix(int64(tx.Transaction.Now), 0).UTC(),
			Block:        tx.Block,
			MCBlockSeqno: tx.MCBlockSeqno,
			MsgLT:        msgLT,
			MsgIndex:     int64(msgIndex),

			// TODO: populate Error field for failed message processing
			// scope: structural validation errors (nil message/content)
			// scope: event extraction errors (BOC decode failures, unsupported message types)
			// currently handled by returning error from processMessage, but error logs not stored
			Error: nil,
		}
		logs = append(logs, log)
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
