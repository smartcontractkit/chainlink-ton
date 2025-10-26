package postgres

import (
	"encoding/binary"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

func TestFilterModel_Conversion(t *testing.T) {
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Test round-trip conversion (ID is not preserved as it's auto-generated)
	originalFilter := models.Filter{
		Name:          "test-filter",
		Address:       testAddr,
		MsgType:       tlb.MsgTypeInternal,
		EventSig:      12345,
		StartingSeqNo: 100,
	}

	// Convert to database model and back
	dbFilterModel := filterModel{}
	dbFilter := dbFilterModel.FromFilter(originalFilter)
	convertedFilter, err := dbFilter.ToFilter()
	require.NoError(t, err)

	// Verify key fields are preserved (excluding ID which is auto-generated)
	require.Equal(t, originalFilter.Name, convertedFilter.Name)
	require.True(t, originalFilter.Address.Equals(convertedFilter.Address))
	require.Equal(t, originalFilter.MsgType, convertedFilter.MsgType)
	require.Equal(t, originalFilter.EventSig, convertedFilter.EventSig)
	require.Equal(t, originalFilter.StartingSeqNo, convertedFilter.StartingSeqNo)
}

func TestFilterModel_InvalidAddress(t *testing.T) {
	// Test conversion fails with invalid address
	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, 12345)

	dbFilter := filterModel{
		ID:            1,
		Name:          "test-filter",
		Address:       "invalid-address",
		MsgType:       string(tlb.MsgTypeInternal),
		EventSig:      eventSig,
		StartingSeqNo: 100,
	}

	_, err := dbFilter.ToFilter()
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to parse address")
}

func TestLogModel_Conversion(t *testing.T) {
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test cell data
	testCell := cell.BeginCell().
		MustStoreUInt(12345, 32).
		EndCell()

	// Test round-trip conversion (ID is not preserved as it's auto-generated)
	originalLog := models.Log{
		FilterID:    2,
		ChainID:     "test-chain",
		Address:     testAddr,
		EventSig:    12345,
		Data:        testCell,
		TxHash:      models.TxHash{1, 2, 3, 4, 5},
		TxLT:        1000,
		TxTimestamp: time.Now().Truncate(time.Microsecond), // Truncate for DB precision
		Block: &ton.BlockIDExt{
			Workchain: 0,
			Shard:     -1,
			SeqNo:     100,
		},
		MasterBlockSeqno: 200,
		MsgIndex:         0,
	}

	// Convert to database model and back
	dbLogModel := logModel{}
	dbLog := dbLogModel.FromLog(originalLog)
	convertedLog, err := dbLog.ToLog()
	require.NoError(t, err)

	// Verify key fields are preserved (excluding ID which is auto-generated)
	require.Equal(t, originalLog.FilterID, convertedLog.FilterID)
	require.Equal(t, originalLog.ChainID, convertedLog.ChainID)
	require.True(t, originalLog.Address.Equals(convertedLog.Address))
	require.Equal(t, originalLog.EventSig, convertedLog.EventSig)
	require.Equal(t, originalLog.TxHash, convertedLog.TxHash)
	require.Equal(t, originalLog.TxLT, convertedLog.TxLT)
	require.Equal(t, originalLog.TxTimestamp, convertedLog.TxTimestamp)
	require.Equal(t, originalLog.Block.Workchain, convertedLog.Block.Workchain)
	require.Equal(t, originalLog.Block.Shard, convertedLog.Block.Shard)
	require.Equal(t, originalLog.Block.SeqNo, convertedLog.Block.SeqNo)
	require.Equal(t, originalLog.MasterBlockSeqno, convertedLog.MasterBlockSeqno)
	require.Equal(t, originalLog.MsgIndex, convertedLog.MsgIndex)

	// Verify cell data can be read
	require.NotNil(t, convertedLog.Data)
}
