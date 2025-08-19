package store

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/orm"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.LogStore = (*sqlLogStore)(nil)

type sqlLogStore struct {
	orm     *orm.DSORM
	chainID string
}

// NewSQLLogStore creates a new SQL-based log store
func NewSQLLogStore(orm *orm.DSORM, chainID string) logpoller.LogStore {
	return &sqlLogStore{
		orm:     orm,
		chainID: chainID,
	}
}

// TODO: likely we don't need methods from memory db interface
// SaveLog saves a single log to the database
func (s *sqlLogStore) SaveLog(log types.Log) {
	s.SaveLogs([]types.Log{log})
}

// SaveLogs saves multiple logs to the database in a batch operation
func (s *sqlLogStore) SaveLogs(logs []types.Log) {
	if len(logs) == 0 {
		return
	}

	dbLogs := make([]orm.LogModel, len(logs))
	for i, log := range logs {
		dbLogs[i] = s.convertToDbLog(log)
	}

	// TODO: implement batch saving
	ctx := context.Background()
	err := s.orm.InsertLogs(ctx, dbLogs)
	if err != nil {
		_ = err
	}
}

// GetLogs retrieves logs for a given address and event signature
func (s *sqlLogStore) GetLogs(srcAddr *address.Address, sig uint32) ([]types.Log, error) {
	addrStr := srcAddr.String()

	dbLogs, err := s.orm.GetLogs(context.Background(), addrStr, int64(sig))
	if err != nil {
		return nil, fmt.Errorf("failed to get logs from database: %w", err)
	}

	// TODO: do we want to do this? after logs are stored
	logs := make([]types.Log, len(dbLogs))
	for i, dbLog := range dbLogs {
		log, err := s.convertFromDbLog(dbLog)
		if err != nil {
			return nil, fmt.Errorf("failed to convert log %d: %w", i, err)
		}
		logs[i] = log
	}

	return logs, nil
}

// convertToDbLog converts a types.Log to orm.DbLog
func (s *sqlLogStore) convertToDbLog(log types.Log) orm.LogModel {
	var data []byte
	if log.Data != nil {
		data = log.Data.ToBOC()
	}

	return orm.LogModel{
		FilterID:         log.FilterID,
		ChainID:          log.ChainID,
		Address:          log.Address.String(),
		EventSig:         int64(log.EventSig),
		Data:             data,
		TxHash:           log.TxHash[:],
		TxLT:             int64(log.TxLT),
		TxTimestamp:      log.TxTimestamp,
		BlockWorkchain:   int(log.Block.Workchain),
		BlockShard:       log.Block.Shard,
		BlockSeqno:       int64(log.Block.SeqNo),
		MasterBlockSeqno: int64(log.MasterBlockSeqno),
	}
}

// convertFromDbLog converts an orm.DbLog to types.Log
func (s *sqlLogStore) convertFromDbLog(dbLog orm.LogModel) (types.Log, error) {
	// Convert address string back to address.Address
	addr, err := address.ParseAddr(dbLog.Address)
	if err != nil {
		return types.Log{}, fmt.Errorf("failed to parse address %s: %w", dbLog.Address, err)
	}

	// Convert BOC data back to cell.Cell
	var cellData *cell.Cell
	if len(dbLog.Data) > 0 {
		cellData, err = cell.FromBOC(dbLog.Data)
		if err != nil {
			return types.Log{}, fmt.Errorf("failed to parse cell data: %w", err)
		}
	}

	// Convert TxHash from slice to fixed array
	var txHash types.TxHash
	copy(txHash[:], dbLog.TxHash)

	// Reconstruct block information
	block := &ton.BlockIDExt{
		Workchain: int32(dbLog.BlockWorkchain),
		Shard:     dbLog.BlockShard,
		SeqNo:     uint32(dbLog.BlockSeqno),
	}

	return types.Log{
		ID:               dbLog.ID,
		FilterID:         dbLog.FilterID,
		ChainID:          dbLog.ChainID,
		Address:          addr,
		EventSig:         uint32(dbLog.EventSig),
		Data:             cellData,
		TxHash:           txHash,
		TxLT:             uint64(dbLog.TxLT),
		TxTimestamp:      dbLog.TxTimestamp,
		Block:            block,
		MasterBlockSeqno: uint32(dbLog.MasterBlockSeqno),
	}, nil
}
