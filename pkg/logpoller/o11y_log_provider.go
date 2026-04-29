package logpoller

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/message"
)

var _ RawLogProvider = (*tonO11yLogProvider)(nil)

type tonO11yLogProvider struct {
	client ton.APIClientWrapped
	loader TxLoader
	lggr   logger.Logger
}

// NewTonO11yLogProvider creates a new RawLogProvider backed by a TON o11y client.
func NewTonO11yLogProvider(client ton.APIClientWrapped, loader TxLoader, lggr logger.Logger) RawLogProvider {
	if lggr == nil {
		lggr = logger.Nop()
	}

	return &tonO11yLogProvider{
		client: client,
		loader: loader,
		lggr:   lggr,
	}
}

// GetLogs retrieves all ExternalMsgOutLogs for an address between fromBlockSeqNo (exclusive) and toBlock (inclusive).
func (tlp *tonO11yLogProvider) GetLogs(ctx context.Context, addr *address.Address, from uint32, to *ton.BlockIDExt) ([]models.RawLog, error) {
	if to == nil {
		return nil, errors.New("to block must not be nil")
	}

	// validate that the provided block belongs to the masterchain
	if to.Workchain != address.MasterchainID {
		return nil, fmt.Errorf("expected masterchain block (workchain %d), got workchain %d", address.MasterchainID, to.Workchain)
	}

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
	blockRange := &models.BlockRange{Prev: prevBlock, To: to}
	txs, err := tlp.loader.GetTxsForAddress(ctx, blockRange, addr, 100)
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

func (tlp *tonO11yLogProvider) extractExternalMsgOutLogs(ctx context.Context, txs []models.Tx) ([]models.RawLog, error) {
	var allLogs []models.RawLog

	for _, tx := range txs {
		msgs, _ := tx.Transaction.IO.Out.ToSlice()

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

			// Not all external out messages follow the ExtOutLogBucket convention (e.g., ownable_2step.tolk emits events with addr_none, which has no CRC32 topic).
			// These are non-CCIP messages that cannot be decoded as log events.
			// Skipping them is safe as they carry no extractable topic and is required to avoid permanently blocking checkpoint advancement for the address.
			eventSig, body, err := message.ParseExtMsgOut(extMsg)
			if err != nil {
				tlp.lggr.Warnw("skipping unparseable external out message",
					"txHash", hex.EncodeToString(tx.Transaction.Hash),
					"LT", tx.Transaction.LT,
					"err", err,
				)
				continue
			}

			// If we got a valid event and body
			if body != nil && eventSig != 0 {
				log := models.RawLog{
					Tx:    tx.Transaction,
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
