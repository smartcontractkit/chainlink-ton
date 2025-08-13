package indexer

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
)

var _ logpoller.TxIndexer = (*indexer)(nil)

type indexer struct {
	lggr    logger.SugaredLogger
	filters logpoller.FilterStore
}

func NewIndexer(lggr logger.Logger, filters logpoller.FilterStore) logpoller.TxIndexer {
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

// indexTx handles a single transaction
func (ixr *indexer) indexTx(tx types.TxWithBlock) ([]types.Log, error) {
	var allLogs []types.Log

	msgs, _ := tx.Tx.IO.Out.ToSlice()
	for _, msg := range msgs {
		srcAddr := msg.Msg.SenderAddr()

		// get filters registered for this source address and message type
		filtersForAddr, err := ixr.filters.GetFiltersForAddressAndMsgType(context.Background(), srcAddr, msg.MsgType)
		if err != nil {
			ixr.lggr.Errorw("Failed to get filters for address and message type", "addr", srcAddr.String(), "msgType", msg.MsgType, "err", err)
			continue
		}

		if len(filtersForAddr) == 0 {
			continue
		}

		for _, filter := range filtersForAddr {
			var eventSig uint32
			var msgBody *cell.Cell
			var err error

			switch msg.MsgType {
			case tlb.MsgTypeExternalOut:
				eventSig, msgBody, err = ixr.parseExtMsgOut(msg.AsExternalOut(), filter)
			case tlb.MsgTypeInternal:
				eventSig, msgBody, err = ixr.parseInternalMsg(msg.AsInternal(), filter)
			case tlb.MsgTypeExternalIn:
				continue // not supported
			}

			if err != nil {
				ixr.lggr.Warnw("Failed to process message with filter", "filterName", filter.Name, "err", err)
				continue
			}

			if msgBody != nil && eventSig != 0 {
				log := types.Log{
					FilterID:    filter.ID,
					EventSig:    eventSig,
					Address:     srcAddr, // source address of the internal message
					Data:        msgBody, // full message body as data
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

// parseExtMsgOut returns body and event signature(topic) for an external out message.
func (ixr *indexer) parseExtMsgOut(msg *tlb.ExternalMessageOut, filter types.Filter) (sig uint32, body *cell.Cell, err error) {
	// for ExtMsgOut we use topic for event sig
	bucket := event.NewExtOutLogBucket(msg.DestAddr())
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		// indexing issue, don't panic
		return 0, nil, errors.New("failed to decode event topic")
	}

	if topic != filter.EventSig {
		return 0, nil, nil // topic doesn't match this filter's criteria.
	}

	return topic, msg.Payload(), nil
}

// parseInternalMsg returns body and event signature(opcode) for an internal message.
// this function extracts opcode, and return remaining body slice as a cell
func (ixr *indexer) parseInternalMsg(msg *tlb.InternalMessage, filter types.Filter) (sig uint32, body *cell.Cell, err error) {
	payload := msg.Payload()
	if payload == nil {
		return 0, nil, nil // no payload
	}

	// extract opcode and remaining body in separate operations to avoid state mutation
	opcode, remainingBody, err := ixr.extractOpcodeAndBody(payload)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to extract opcode and body: %w", err)
	}

	if opcode != filter.EventSig {
		return 0, nil, nil // opcode doesn't match this filter's criteria
	}

	return opcode, remainingBody, nil
}

// extractOpcodeAndBody safely extracts the opcode and remaining body without mutating the original cell
func (ixr *indexer) extractOpcodeAndBody(payload *cell.Cell) (opcode uint32, remainingBody *cell.Cell, err error) {
	// create a slice for reading without mutating the original
	payloadSlice := payload.BeginParse()

	// validate we have enough bits for opcode
	if payloadSlice.BitsLeft() < 32 {
		return 0, nil, fmt.Errorf("insufficient bits for opcode: %d bits available, 32 required", payloadSlice.BitsLeft())
	}

	// extract opcode (first 32 bits)
	opcode64, err := payloadSlice.LoadUInt(32)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to load opcode: %w", err)
	}
	opcode = uint32(opcode64) //nolint:gosec // LoadUInt(32) guarantees this fits in uint32

	// create a new cell from the remaining data after opcode
	if payloadSlice.BitsLeft() == 0 {
		// no remaining bits, create empty cell
		remainingBody = cell.BeginCell().EndCell()
	} else {
		// convert remaining data to cell
		remainingBody, err = payloadSlice.ToCell()
		if err != nil {
			return 0, nil, fmt.Errorf("failed to convert remaining body to cell: %w", err)
		}
	}

	return opcode, remainingBody, nil
}
