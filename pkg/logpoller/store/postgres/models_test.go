package postgres

import (
	"encoding/binary"
	"encoding/hex"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/boc"
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
	// Test conversion fails with invalid address string
	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, 12345)

	dbFilter := filterModel{
		ID:            1,
		Name:          "test-filter",
		Address:       []byte{0x00}, // Invalid TON address
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
		MCBlockSeqno: 200,
		MsgIndex:     0,
	}

	// Convert to database model and back
	dbLogModel := logModel{}
	dbLog, err := dbLogModel.FromLog(originalLog)
	require.NoError(t, err)
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
	require.Equal(t, originalLog.MCBlockSeqno, convertedLog.MCBlockSeqno)
	require.Equal(t, originalLog.MsgIndex, convertedLog.MsgIndex)

	// Verify cell data can be read
	require.NotNil(t, convertedLog.Data)

	// Verify BOC split fields
	require.NotEmpty(t, dbLog.DataHeader)
	require.NotEmpty(t, dbLog.DataPayload)
}

// TestCalculateBOCHeaderLen verifies dynamic header calculation is type-agnostic
func TestCalculateBOCHeaderLen(t *testing.T) {
	tests := []struct {
		name      string
		buildCell func() *cell.Cell
	}{
		{
			name: "simple cell",
			buildCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreUInt(0x12345678, 32).EndCell()
			},
		},
		{
			name: "cell with ref",
			buildCell: func() *cell.Cell {
				innerCell := cell.BeginCell().MustStoreUInt(0xABCD, 16).EndCell()
				return cell.BeginCell().
					MustStoreUInt(0x1234, 16).
					MustStoreRef(innerCell).
					EndCell()
			},
		},
		{
			name: "empty cell",
			buildCell: func() *cell.Cell {
				return cell.BeginCell().EndCell()
			},
		},
		{
			name: "large cell",
			buildCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreSlice(make([]byte, 100), 800).EndCell()
			},
		},
		{
			name: "cell with multiple refs",
			buildCell: func() *cell.Cell {
				ref1 := cell.BeginCell().MustStoreUInt(0x1111, 16).EndCell()
				ref2 := cell.BeginCell().MustStoreUInt(0x2222, 16).EndCell()
				return cell.BeginCell().
					MustStoreUInt(0xAAAA, 16).
					MustStoreRef(ref1).
					MustStoreRef(ref2).
					EndCell()
			},
		},
		{
			name: "CCIP message sent event",
			buildCell: func() *cell.Cell {
				sender, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
				feeToken, _ := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")

				event := onramp.CCIPMessageSent{
					Message: ocr.TVM2AnyRampMessage{
						Header: ocr.RampMessageHeader{
							MessageID:           make([]byte, 32),
							SourceChainSelector: 1,
							DestChainSelector:   2,
							SequenceNumber:      100,
							Nonce:               200,
						},
						Sender: sender,
						Body: ocr.TVM2AnyRampMessageBody{
							Receiver:       common.CrossChainAddress{0x01, 0x02},
							Data:           common.SnakeBytes{0xAA, 0xBB, 0xCC},
							ExtraArgs:      cell.BeginCell().EndCell(),
							TokenAmounts:   cell.BeginCell().EndCell(),
							FeeToken:       feeToken,
							FeeTokenAmount: big.NewInt(1000000),
						},
						FeeValueJuels: big.NewInt(500000),
					},
				}

				c, _ := tlb.ToCell(event)
				return c
			},
		},
		{
			name: "CCIP execution state changed event",
			buildCell: func() *cell.Cell {
				event := offramp.ExecutionStateChanged{
					SourceChainSelector: 1,
					SequenceNumber:      100,
					MessageID:           make([]byte, 32),
					State:               2,
				}

				c, _ := tlb.ToCell(event)
				return c
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			originalCell := tt.buildCell()
			bocBytes := originalCell.ToBOC()

			// calculate header length dynamically
			headerLen, err := boc.HeaderLen(bocBytes)
			require.NoError(t, err)
			require.Positive(t, headerLen)
			require.Less(t, headerLen, len(bocBytes))

			// verify split and join preserves data
			header := bocBytes[:headerLen]
			payload := bocBytes[headerLen:]

			require.NotEmpty(t, header)
			require.NotEmpty(t, payload)

			reconstructedBOC := make([]byte, 0, len(header)+len(payload))
			reconstructedBOC = append(reconstructedBOC, header...)
			reconstructedBOC = append(reconstructedBOC, payload...)
			require.Equal(t, bocBytes, reconstructedBOC)

			// verify cell reconstruction works
			reconstructedCell, err := cell.FromBOC(reconstructedBOC)
			require.NoError(t, err)
			require.Equal(t, originalCell.Hash(), reconstructedCell.Hash())
		})
	}
}

// TestBOCPayloadByteFiltering verifies that split payload enables correct SQL byte filtering
func TestBOCPayloadByteFiltering(t *testing.T) {
	tests := []struct {
		name          string
		buildCell     func() *cell.Cell
		expectedBytes map[int][]byte // offset -> expected bytes
	}{
		{
			name: "simple uint32",
			buildCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreUInt(0x12345678, 32).EndCell()
			},
			expectedBytes: map[int][]byte{
				0: {0x12, 0x34, 0x56, 0x78}, // full uint32 at offset 0
				1: {0x34, 0x56, 0x78},       // partial from offset 1
			},
		},
		{
			name: "CCIP execution state changed - verify field offsets",
			buildCell: func() *cell.Cell {
				event := offramp.ExecutionStateChanged{
					SourceChainSelector: 0x0000000000000001,
					SequenceNumber:      0x00000000000000FF,
					MessageID:           make([]byte, 32),
					State:               0x02,
				}
				c, _ := tlb.ToCell(event)
				return c
			},
			expectedBytes: map[int][]byte{
				0: {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}, // source chain selector at offset 0
				8: {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF}, // sequence number at offset 8
			},
		},
		{
			name: "multiple uint32 values",
			buildCell: func() *cell.Cell {
				return cell.BeginCell().
					MustStoreUInt(0xAABBCCDD, 32). // at offset 0
					MustStoreUInt(0x11223344, 32). // at offset 4
					MustStoreUInt(0xFFEEDDCC, 32). // at offset 8
					EndCell()
			},
			expectedBytes: map[int][]byte{
				0: {0xAA, 0xBB, 0xCC, 0xDD},
				4: {0x11, 0x22, 0x33, 0x44},
				8: {0xFF, 0xEE, 0xDD, 0xCC},
				2: {0xCC, 0xDD, 0x11, 0x22}, // cross-boundary read
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			originalCell := tt.buildCell()
			bocBytes := originalCell.ToBOC()

			// split using our function
			headerLen, err := boc.HeaderLen(bocBytes)
			require.NoError(t, err)

			payload := bocBytes[headerLen:]

			// payload starts with 2-byte cell descriptor
			// actual cell data starts at byte 2
			cellData := payload[boc.CellDescriptorSize:]

			// verify expected bytes at each offset
			for offset, expected := range tt.expectedBytes {
				actual := cellData[offset : offset+len(expected)]
				require.Equal(t, expected, actual,
					"at offset %d: expected %x, got %x", offset, expected, actual)

				// simulate SQL SUBSTRING query
				// SQL is 1-based, and operates on boc_payload which includes descriptor
				// so SQL offset = cell_data_offset + descriptor_size + 1
				sqlOffset := offset + boc.CellDescriptorSize + 1
				sqlResult := payload[sqlOffset-1 : sqlOffset-1+len(expected)]
				require.Equal(t, expected, sqlResult,
					"SQL SUBSTRING(boc_payload, %d, %d) should return %x, got %x",
					sqlOffset, len(expected), expected, sqlResult)
			}

			// verify cell reconstruction still works
			reconstructedBOC := make([]byte, 0, headerLen+len(payload))
			reconstructedBOC = append(reconstructedBOC, bocBytes[:headerLen]...)
			reconstructedBOC = append(reconstructedBOC, payload...)
			reconstructedCell, err := cell.FromBOC(reconstructedBOC)
			require.NoError(t, err)
			require.Equal(t, originalCell.Hash(), reconstructedCell.Hash())
		})
	}
}

func TestLogModel_BOCHeaderPayloadSplit(t *testing.T) {
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	testCases := []struct {
		name           string
		bocHex         string
		expectedHeader int
	}{
		{
			"CCIP_11_byte_header",
			"b5ee9c724101040100de0001dbec712336f3d9bad60787cb41bdd4fa6f167b1d57ee6c73c633be9902249b27d0c09c614ab4cba0de0c9f9284461c852b000000000000000100000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae00000000000000000000000100104838000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100203030300422012345678901234567890123456789012345678901234567890123456789012340000a04bb835",
			11,
		},
		{
			"CommitReportAccepted_11_byte",
			"b5ee9c7241010101005000009b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d00000000000000008000000000000000df513addb30a7c281b29b5e33872a05e3a408c74829bdc220e4a83397ba303eaa06e51f72f",
			11,
		},
		{
			"ExecutionStateChanged_11_byte",
			"b5ee9c724101010100330000620c9f9284461c852b00000000000000010000000000000000000000000000000000000000000000000000000000000001016423df08",
			11,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			bocBytes, err := hex.DecodeString(tc.bocHex)
			require.NoError(t, err)

			originalCell, err := cell.FromBOC(bocBytes)
			require.NoError(t, err)

			originalLog := models.Log{
				FilterID:    1,
				ChainID:     "test-chain",
				Address:     testAddr,
				EventSig:    0x12345678,
				Data:        originalCell,
				TxHash:      models.TxHash{1, 2, 3, 4, 5},
				TxLT:        1000,
				TxTimestamp: time.Now().Truncate(time.Microsecond),
				Block: &ton.BlockIDExt{
					Workchain: 0,
					Shard:     -1,
					SeqNo:     100,
					RootHash:  make([]byte, 32),
					FileHash:  make([]byte, 32),
				},
				MCBlockSeqno: 200,
				MsgLT:        1000,
				MsgIndex:     0,
			}

			dbModel, err := (&logModel{}).FromLog(originalLog)
			require.NoError(t, err)

			require.NotEmpty(t, dbModel.DataHeader)
			require.NotEmpty(t, dbModel.DataPayload)
			require.Len(t, dbModel.DataHeader, tc.expectedHeader)
			require.Len(t, dbModel.DataPayload, len(bocBytes)-tc.expectedHeader)

			reconstructed, err := dbModel.ToLog()
			require.NoError(t, err)
			require.Equal(t, originalCell.Hash(), reconstructed.Data.Hash())
		})
	}
}
