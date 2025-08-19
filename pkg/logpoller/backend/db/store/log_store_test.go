package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/orm"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

func TestSqlLogStore_ConvertToDbLog(t *testing.T) {
	store := &sqlLogStore{chainID: "test-chain"}

	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test cell data
	testCell := cell.BeginCell().
		MustStoreUInt(12345, 32).
		EndCell()

	// Create test log
	log := types.Log{
		ID:          1,
		FilterID:    2,
		ChainID:     "test-chain",
		Address:     testAddr,
		EventSig:    12345,
		Data:        testCell,
		TxHash:      types.TxHash{1, 2, 3, 4, 5},
		TxLT:        1000,
		TxTimestamp: time.Now(),
		Block: &ton.BlockIDExt{
			Workchain: 0,
			Shard:     -1,
			SeqNo:     100,
		},
		MasterBlockSeqno: 200,
	}

	// Test conversion
	dbLog := store.convertToDbLog(log)

	assert.Equal(t, log.FilterID, dbLog.FilterID)
	assert.Equal(t, log.ChainID, dbLog.ChainID)
	assert.Equal(t, log.Address.String(), dbLog.Address)
	assert.Equal(t, int64(log.EventSig), dbLog.EventSig)
	assert.Equal(t, log.TxHash[:], dbLog.TxHash)
	assert.Equal(t, int64(log.TxLT), dbLog.TxLT)
	assert.Equal(t, log.TxTimestamp, dbLog.TxTimestamp)
	assert.Equal(t, int(log.Block.Workchain), dbLog.BlockWorkchain)
	assert.Equal(t, log.Block.Shard, dbLog.BlockShard)
	assert.Equal(t, int64(log.Block.SeqNo), dbLog.BlockSeqno)
	assert.Equal(t, int64(log.MasterBlockSeqno), dbLog.MasterBlockSeqno)

	// Test that cell data is properly encoded
	assert.NotNil(t, dbLog.Data)
	assert.True(t, len(dbLog.Data) > 0)
}

func TestSqlLogStore_ConvertFromDbLog(t *testing.T) {
	store := &sqlLogStore{chainID: "test-chain"}

	// Create test cell data
	testCell := cell.BeginCell().
		MustStoreUInt(12345, 32).
		EndCell()
	bocData := testCell.ToBOC()

	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test database log
	dbLog := orm.LogModel{
		ID:               1,
		FilterID:         2,
		ChainID:          "test-chain",
		Address:          testAddr.String(),
		EventSig:         12345,
		Data:             bocData,
		TxHash:           []byte{1, 2, 3, 4, 5},
		TxLT:             1000,
		TxTimestamp:      time.Now(),
		BlockWorkchain:   0,
		BlockShard:       -1,
		BlockSeqno:       100,
		MasterBlockSeqno: 200,
	}

	// Test conversion
	log, err := store.convertFromDbLog(dbLog)
	require.NoError(t, err)

	assert.Equal(t, dbLog.ID, log.ID)
	assert.Equal(t, dbLog.FilterID, log.FilterID)
	assert.Equal(t, dbLog.ChainID, log.ChainID)
	assert.Equal(t, dbLog.Address, log.Address.String())
	assert.Equal(t, uint32(dbLog.EventSig), log.EventSig)
	assert.Equal(t, uint64(dbLog.TxLT), log.TxLT)
	assert.Equal(t, dbLog.TxTimestamp, log.TxTimestamp)
	assert.Equal(t, int32(dbLog.BlockWorkchain), log.Block.Workchain)
	assert.Equal(t, dbLog.BlockShard, log.Block.Shard)
	assert.Equal(t, uint32(dbLog.BlockSeqno), log.Block.SeqNo)
	assert.Equal(t, uint32(dbLog.MasterBlockSeqno), log.MasterBlockSeqno)

	// Test that cell data is properly decoded
	assert.NotNil(t, log.Data)

	// Test TxHash conversion
	expectedHash := types.TxHash{}
	copy(expectedHash[:], dbLog.TxHash[:5]) // Only first 5 bytes
	assert.Equal(t, expectedHash, log.TxHash)
}
