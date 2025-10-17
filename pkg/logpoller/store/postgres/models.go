package postgres

import (
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
	Address       string    `db:"address"` // user-friendly TON address string
	MsgType       string    `db:"msg_type"`
	EventSig      uint32    `db:"event_sig"`
	StartingSeqNo uint32    `db:"starting_seq_no"` //TODO: not in use
	CreatedAt     time.Time `db:"created_at"`
}

// FromFilter converts a types.Filter to FilterModel
func (f *filterModel) FromFilter(filter lptypes.Filter) filterModel {
	return filterModel{
		Name:          filter.Name,
		Address:       filter.Address.String(),
		MsgType:       string(filter.MsgType),
		EventSig:      filter.EventSig,
		StartingSeqNo: filter.StartingSeqNo,
	}
}

// ToFilter converts a FilterModel to models.Filter
func (f filterModel) ToFilter() (lptypes.Filter, error) {
	addr, err := address.ParseAddr(f.Address)
	if err != nil {
		return lptypes.Filter{}, fmt.Errorf("failed to parse address %s: %w", f.Address, err)
	}

	return lptypes.Filter{
		ID:            f.ID,
		Name:          f.Name,
		Address:       addr,
		MsgType:       tlb.MsgType(f.MsgType),
		EventSig:      f.EventSig,
		StartingSeqNo: f.StartingSeqNo,
	}, nil
}

// logModel represents the 'ton.log_poller_logs' table schema.
type logModel struct {
	ID               int64     `db:"id"`
	FilterID         int64     `db:"filter_id"`
	ChainID          string    `db:"chain_id"`
	Address          string    `db:"address"`
	EventSig         int64     `db:"event_sig"`
	Data             []byte    `db:"data"`
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
func (l *logModel) FromLog(log lptypes.Log) logModel {
	var data []byte
	if log.Data != nil {
		data = log.Data.ToBOC()
	}

	return logModel{
		FilterID:         log.FilterID,
		ChainID:          log.ChainID,
		Address:          log.Address.String(),
		EventSig:         int64(log.EventSig),
		Data:             data,
		TxHash:           log.TxHash[:],
		TxLT:             strconv.FormatUint(log.TxLT, 10), // Convert uint64 to string for NUMERIC(20,0) storage
		TxTimestamp:      log.TxTimestamp,
		BlockWorkchain:   int(log.Block.Workchain),
		BlockShard:       log.Block.Shard,
		BlockSeqno:       int64(log.Block.SeqNo),
		BlockRootHash:    log.Block.RootHash,
		BlockFileHash:    log.Block.FileHash,
		MasterBlockSeqno: int64(log.MasterBlockSeqno),
		MsgLT:            strconv.FormatUint(log.MsgLT, 10),
		MsgIndex:         log.MsgIndex,
	}
}

// ToLog converts a logModel to models.Log
func (l logModel) ToLog() (lptypes.Log, error) {
	// Convert address string back to address.Address
	addr, err := address.ParseAddr(l.Address)
	if err != nil {
		return lptypes.Log{}, fmt.Errorf("failed to parse address %s: %w", l.Address, err)
	}

	// Convert BOC data back to cell.Cell
	var cellData *cell.Cell
	if len(l.Data) > 0 {
		cellData, err = cell.FromBOC(l.Data)
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
		EventSig:         uint32(l.EventSig), //nolint:gosec // EventSig values are controlled and within uint32 range
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
