package postgres

import (
	"encoding/binary"
	"fmt"
	"strconv"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	lptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// filterModel represents the 'ton_log_poller_filters' table schema.
type filterModel struct {
	ID            int64     `db:"id"`
	ChainID       string    `db:"chain_id"`
	Name          string    `db:"name"`
	Address       string    `db:"address"` // TON address in user-friendly format
	MsgType       string    `db:"msg_type"`
	EventSig      []byte    `db:"event_sig"` // CRC32 hash as 4-byte binary
	StartingSeqNo uint32    `db:"starting_seq_no"`
	CreatedAt     time.Time `db:"created_at"`
}

// FromFilter converts a types.Filter to FilterModel
func (f *filterModel) FromFilter(filter lptypes.Filter) filterModel {
	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, filter.EventSig)

	return filterModel{
		Name:          filter.Name,
		Address:       filter.Address.String(),
		MsgType:       string(filter.MsgType),
		EventSig:      eventSig,
		StartingSeqNo: filter.StartingSeqNo,
	}
}

// ToFilter converts a FilterModel to models.Filter
func (f filterModel) ToFilter() (lptypes.Filter, error) {
	if len(f.EventSig) != 4 {
		return lptypes.Filter{}, fmt.Errorf("invalid event_sig length: expected 4 bytes, got %d", len(f.EventSig))
	}

	// Parse address from string format
	addr, err := address.ParseAddr(f.Address)
	if err != nil {
		return lptypes.Filter{}, fmt.Errorf("failed to parse address %s: %w", f.Address, err)
	}

	return lptypes.Filter{
		ID:            f.ID,
		Name:          f.Name,
		Address:       addr,
		MsgType:       tlb.MsgType(f.MsgType),
		EventSig:      binary.BigEndian.Uint32(f.EventSig),
		StartingSeqNo: f.StartingSeqNo,
	}, nil
}

// logModel represents the 'ton.log_poller_logs' table schema.
type logModel struct {
	ID               int64     `db:"id"`
	FilterID         int64     `db:"filter_id"`
	ChainID          string    `db:"chain_id"`
	Address          string    `db:"address"`   // TON address in user-friendly format
	EventSig         []byte    `db:"event_sig"` // CRC32 hash as 4-byte binary
	BocHeader        []byte    `db:"boc_header"`
	BocPayload       []byte    `db:"boc_payload"`
	TxHash           []byte    `db:"tx_hash"`
	TxLT             string    `db:"tx_lt"` // tx_lt is stored as NUMERIC(20,0) to support uint64 range
	TxTimestamp      time.Time `db:"tx_timestamp"`
	MsgLT            string    `db:"msg_lt"` // msg_lt is stored as NUMERIC(20,0) to support uint64 range
	MsgIndex         int64     `db:"msg_index"`
	BlockWorkchain   int       `db:"block_workchain"`
	BlockShard       int64     `db:"block_shard"`
	BlockSeqno       int64     `db:"block_seqno"`
	BlockRootHash    []byte    `db:"block_root_hash"`
	BlockFileHash    []byte    `db:"block_file_hash"`
	MasterBlockSeqno int64     `db:"master_block_seqno"`
	CreatedAt        time.Time `db:"created_at"`
}

// FromLog converts a models.Log to logModel
func (l *logModel) FromLog(log lptypes.Log) (logModel, error) {
	var header, payload []byte
	if log.Data != nil {
		boc := log.Data.ToBOC()

		// calculate header length dynamically based on BOC structure
		headerLen, err := calculateBOCHeaderLen(boc)
		if err != nil {
			return logModel{}, fmt.Errorf("failed to calculate BOC header length for address %s: %w", log.Address.String(), err)
		}

		header = boc[:headerLen]
		payload = boc[headerLen:]
	}

	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, log.EventSig)

	return logModel{
		FilterID:         log.FilterID,
		ChainID:          log.ChainID,
		Address:          log.Address.String(),
		EventSig:         eventSig,
		BocHeader:        header,
		BocPayload:       payload,
		TxHash:           log.TxHash[:],
		TxLT:             strconv.FormatUint(log.TxLT, 10),
		TxTimestamp:      log.TxTimestamp,
		BlockWorkchain:   int(log.Block.Workchain),
		BlockShard:       log.Block.Shard,
		BlockSeqno:       int64(log.Block.SeqNo),
		BlockRootHash:    log.Block.RootHash,
		BlockFileHash:    log.Block.FileHash,
		MasterBlockSeqno: int64(log.MasterBlockSeqno),
		MsgLT:            strconv.FormatUint(log.MsgLT, 10),
		MsgIndex:         log.MsgIndex,
	}, nil
}

// ToLog converts a logModel to models.Log
func (l logModel) ToLog() (lptypes.Log, error) {
	if len(l.EventSig) != 4 {
		return lptypes.Log{}, fmt.Errorf("invalid event_sig length: expected 4 bytes, got %d", len(l.EventSig))
	}

	// Parse address from string format
	addr, err := address.ParseAddr(l.Address)
	if err != nil {
		return lptypes.Log{}, fmt.Errorf("failed to parse address %s: %w", l.Address, err)
	}

	// reconstruct full BOC from header and payload
	var cellData *cell.Cell
	if len(l.BocHeader) > 0 && len(l.BocPayload) > 0 {
		fullBOC := append(l.BocHeader, l.BocPayload...)
		cellData, err = cell.FromBOC(fullBOC)
		if err != nil {
			return lptypes.Log{}, fmt.Errorf("failed to parse cell data: %w", err)
		}
	}

	// parse TxLT from NUMERIC(20,0) string back to uint64
	txLT, err := strconv.ParseUint(l.TxLT, 10, 64)
	if err != nil {
		return lptypes.Log{}, fmt.Errorf("failed to parse TxLT %s: %w", l.TxLT, err)
	}

	msgLT, err := strconv.ParseUint(l.MsgLT, 10, 64)
	if err != nil {
		return lptypes.Log{}, fmt.Errorf("failed to parse MsgLT %s: %w", l.MsgLT, err)
	}

	var txHash lptypes.TxHash
	copy(txHash[:], l.TxHash)

	// Reconstruct block information
	block := &ton.BlockIDExt{
		Workchain: int32(l.BlockWorkchain), //nolint:gosec // TON workchain values are small
		Shard:     l.BlockShard,
		SeqNo:     uint32(l.BlockSeqno), //nolint:gosec // TON seqno values fit in uint32
		RootHash:  l.BlockRootHash,
		FileHash:  l.BlockFileHash,
	}

	return lptypes.Log{
		ID:               l.ID,
		FilterID:         l.FilterID,
		ChainID:          l.ChainID,
		Address:          addr,
		EventSig:         binary.BigEndian.Uint32(l.EventSig),
		Data:             cellData,
		TxHash:           txHash,
		TxLT:             txLT,
		TxTimestamp:      l.TxTimestamp,
		Block:            block,
		MasterBlockSeqno: uint32(l.MasterBlockSeqno), //nolint:gosec // MasterBlockSeqno values are controlled and within uint32 range
		MsgLT:            msgLT,
		MsgIndex:         l.MsgIndex,
	}, nil
}

// cell descriptor is always 2 bytes
const cellDescriptorSize = 2

// calculateBOCHeaderLen calculates the header length of a BOC based on its structure
// header = magic(4) + flags(1) + sizeBytes(1) + cellsNum(cellSizeBytes) + rootsNum(cellSizeBytes) +
//
//	completeNum(cellSizeBytes) + dataLen(sizeBytes) + rootIdx(cellSizeBytes)
func calculateBOCHeaderLen(boc []byte) (int, error) {
	if len(boc) < 6 {
		return 0, fmt.Errorf("BOC too small: minimum 6 bytes required for header")
	}

	flags := boc[4]
	cellSizeBytes := int(flags & 0x07) // last 3 bits
	sizeBytes := int(boc[5])

	// header size = fixed(6) + variable((4 × cellSizeBytes) + sizeBytes)
	headerSize := 6 + (4 * cellSizeBytes) + sizeBytes

	if len(boc) < headerSize {
		return 0, fmt.Errorf("BOC too small for calculated header size %d, actual size %d", headerSize, len(boc))
	}

	return headerSize, nil
}
