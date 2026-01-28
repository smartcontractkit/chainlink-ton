package postgres

import (
	"encoding/binary"
	"fmt"
	"strconv"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	lptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/boc"
)

// filterModel represents the 'ton_log_poller_filters' table schema.
type filterModel struct {
	ID            int64         `db:"id"`
	ChainID       string        `db:"chain_id"`
	Name          string        `db:"name"`
	Address       []byte        `db:"address"` // TON address in raw byte format
	MsgType       string        `db:"msg_type"`
	EventSig      []byte        `db:"event_sig"` // CRC32 hash as 4-byte binary
	StartingSeqNo int64         `db:"starting_seq_no"`
	LogRetention  time.Duration `db:"log_retention"`
	MaxLogsKept   int64         `db:"max_logs_kept"`
	CreatedAt     time.Time     `db:"created_at"`
}

// FromFilter converts a types.Filter to FilterModel
func (f *filterModel) FromFilter(filter lptypes.Filter) filterModel {
	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, filter.EventSig)

	rawAddr := codec.ToRawAddr(filter.Address)
	return filterModel{
		Name:          filter.Name,
		Address:       rawAddr[:],
		MsgType:       string(filter.MsgType),
		EventSig:      eventSig,
		StartingSeqNo: int64(filter.StartingSeqNo),
		LogRetention:  filter.LogRetention,
		MaxLogsKept:   filter.MaxLogsKept,
	}
}

// ToFilter converts a FilterModel to models.Filter
func (f filterModel) ToFilter() (lptypes.Filter, error) {
	if len(f.EventSig) != 4 {
		return lptypes.Filter{}, fmt.Errorf("invalid event_sig length: expected 4 bytes, got %d", len(f.EventSig))
	}

	// Parse address from raw byte format
	addr, err := codec.AddressBytesToTONAddress(f.Address)
	if err != nil {
		return lptypes.Filter{}, fmt.Errorf("failed to parse address %s: %w", f.Address, err)
	}

	return lptypes.Filter{
		ID:            f.ID,
		Name:          f.Name,
		Address:       addr,
		MsgType:       tlb.MsgType(f.MsgType),
		EventSig:      binary.BigEndian.Uint32(f.EventSig),
		StartingSeqNo: uint32(f.StartingSeqNo), //nolint:gosec // safe conversion
		LogRetention:  f.LogRetention,
		MaxLogsKept:   f.MaxLogsKept,
	}, nil
}

// logModel represents the 'ton.log_poller_logs' table schema.
type logModel struct {
	ID             int64      `db:"id"`
	FilterID       int64      `db:"filter_id"`
	ChainID        string     `db:"chain_id"`
	Address        []byte     `db:"address"`      // TON address in raw byte format
	EventSig       []byte     `db:"event_sig"`    // CRC32 hash as 4-byte binary
	DataHeader     []byte     `db:"data_header"`  // BOC header (variable size)
	DataPayload    []byte     `db:"data_payload"` // BOC payload (cell descriptor + data)
	TxHash         []byte     `db:"tx_hash"`
	TxLT           string     `db:"tx_lt"` // tx_lt is stored as NUMERIC(20,0) to support uint64 range
	TxTimestamp    time.Time  `db:"tx_timestamp"`
	MsgLT          string     `db:"msg_lt"` // msg_lt is stored as NUMERIC(20,0) to support uint64 range
	MsgIndex       int64      `db:"msg_index"`
	BlockWorkchain int        `db:"block_workchain"`
	BlockShard     int64      `db:"block_shard"`
	BlockSeqno     int64      `db:"block_seqno"`
	BlockRootHash  []byte     `db:"block_root_hash"`
	BlockFileHash  []byte     `db:"block_file_hash"`
	MCBlockSeqno   int64      `db:"master_block_seqno"`
	CreatedAt      time.Time  `db:"created_at"`
	ExpiresAt      *time.Time `db:"expires_at"` // nullable when retention = 0
}

// FromLog converts a models.Log to logModel
func (l *logModel) FromLog(log lptypes.Log) (logModel, error) {
	var dataHeader, dataPayload []byte
	if log.Data != nil {
		bocData := log.Data.ToBOC()

		headerLen, err := boc.HeaderLen(bocData)
		if err != nil {
			return logModel{}, fmt.Errorf("failed to calculate BOC header length: %w", err)
		}

		dataHeader = bocData[:headerLen]
		dataPayload = bocData[headerLen:]
	}

	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, log.EventSig)

	rawAddr := codec.ToRawAddr(log.Address)
	return logModel{
		FilterID:       log.FilterID,
		ChainID:        log.ChainID,
		Address:        rawAddr[:],
		EventSig:       eventSig,
		DataHeader:     dataHeader,
		DataPayload:    dataPayload,
		TxHash:         log.TxHash[:],
		TxLT:           strconv.FormatUint(log.TxLT, 10), // Convert uint64 to string for NUMERIC(20,0) storage
		TxTimestamp:    log.TxTimestamp,
		BlockWorkchain: int(log.Block.Workchain),
		BlockShard:     log.Block.Shard,
		BlockSeqno:     int64(log.Block.SeqNo),
		BlockRootHash:  log.Block.RootHash,
		BlockFileHash:  log.Block.FileHash,
		MCBlockSeqno:   int64(log.MCBlockSeqno),
		MsgLT:          strconv.FormatUint(log.MsgLT, 10),
		MsgIndex:       log.MsgIndex,
		ExpiresAt:      log.ExpiresAt,
	}, nil
}

// ToLog converts a logModel to models.Log
func (l logModel) ToLog() (lptypes.Log, error) {
	if len(l.EventSig) != 4 {
		return lptypes.Log{}, fmt.Errorf("invalid event_sig length: expected 4 bytes, got %d", len(l.EventSig))
	}

	// Parse address from raw byte format
	addr, err := codec.AddressBytesToTONAddress(l.Address)
	if err != nil {
		return lptypes.Log{}, fmt.Errorf("failed to parse address %s: %w", l.Address, err)
	}

	// Reconstruct full BOC from header + payload
	var cellData *cell.Cell
	if len(l.DataHeader) > 0 && len(l.DataPayload) > 0 {
		fullBOC := make([]byte, 0, len(l.DataHeader)+len(l.DataPayload))
		fullBOC = append(fullBOC, l.DataHeader...)
		fullBOC = append(fullBOC, l.DataPayload...)

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

	// parse MsgLT from NUMERIC(20,0) string back to uint64
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
		ID:           l.ID,
		FilterID:     l.FilterID,
		ChainID:      l.ChainID,
		Address:      addr,
		EventSig:     binary.BigEndian.Uint32(l.EventSig),
		Data:         cellData,
		TxHash:       txHash,
		TxLT:         txLT,
		TxTimestamp:  l.TxTimestamp,
		Block:        block,
		MCBlockSeqno: uint32(l.MCBlockSeqno), //nolint:gosec // MCBlockSeqno values are safe to convert to uint32
		MsgLT:        msgLT,
		MsgIndex:     l.MsgIndex,
		ExpiresAt:    l.ExpiresAt,
	}, nil
}
