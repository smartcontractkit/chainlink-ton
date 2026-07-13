package boc

import (
	"encoding/binary"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
)

// BOC Header Structure Reference (from tonutils-go/tvm/cell/parse.go:32-65)
//
// A BOC (Bag of Cells) consists of:
//   Header + Payload
//
// Header structure (variable size):
//   - Magic:        4 bytes (0xB5EE9C72)
//   - Flags:        1 byte  (has_idx | has_crc32c | has_cache_bits | flags(2) | size(3))
//   - Size bytes:   1 byte  (off_bytes, determines size of length fields)
//   - Cell count:   cellSizeBytes (from flags)
//   - Root count:   cellSizeBytes
//   - Complete:     cellSizeBytes
//   - Data length:  sizeBytes (total payload size)
//   - Root indices: rootCount × cellSizeBytes
//   - Index:        (optional, if has_idx=true) cellCount × sizeBytes
//
// Payload structure:
//   - Cell data with descriptors (2 bytes per cell)
//   - CRC32 checksum (optional, if has_crc32c=true) 4 bytes
//
// The HeaderLen() function mirrors tonutils-go's FromBOC header parsing
// to determine where the payload starts, enabling header/body split for database storage.

// CCIP BOC test data extracted from integration-tests/smoke/chainaccessor/accessor_test.go
// These are real BOC hexes captured from TypeScript tests representing actual CCIP events

const (
	// CCIPMessageSent BOCs - 3 different sequence numbers
	CCIPMessageSentSeq1BOC = "b5ee9c724101040100de0001dbec712336f3d9bad60787cb41bdd4fa6f167b1d57ee6c73c633be9902249b27d0c09c614ab4cba0de0c9f9284461c852b000000000000000100000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae00000000000000000000000100104838000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100203030300422012345678901234567890123456789012345678901234567890123456789012340000a04bb835"
	CCIPMessageSentSeq2BOC = "b5ee9c724101040100de0001db56bd19cb412a95dca040f874a6389700c33b81d192bd5cd64292c3791742f3d0c09c614ab4cba0de0c9f9284461c852b000000000000000200000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae000000000000000000000001001048380000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001002030303004220abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890000060ebc76d"
	CCIPMessageSentSeq3BOC = "b5ee9c724101040100de0001db5f4159ce2bcb67087cefd5ab9156077d0021f0170cc6f0032c0cdd76ac0e7c4ac09c614ab4cba0de0c9f9284461c852b000000000000000300000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae000000000000000000000001001048380000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001002030303004220fedcba0987654321fedcba0987654321fedcba0987654321fedcba098765432100005a837d0d"

	// CommitReportAccepted BOCs - 3 variants (merkle-only, price-only, both)
	CommitReportAcceptedMerkleRootOnlyBOC = "b5ee9c7241010101005000009b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d00000000000000008000000000000000df513addb30a7c281b29b5e33872a05e3a408c74829bdc220e4a83397ba303eaa06e51f72f"
	CommitReportAcceptedPriceOnlyBOC      = "b5ee9c7241010401006e000101600102000203007b80186c5b823fab63015c89fcbba3a5f7da0f33a4d86ab8550295cefee69c53a674a00000000000000000000000000000000000000000000000000000003000480c9f9284461c852b00000000000000000000000000010000000000000000000000000001e97333c0"
	CommitReportAcceptedBothBOC           = "b5ee9c724101040100bb00019b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d000000000000000080000000000000009cb293328e30ade20be171db6e64f9c523767f882382cef1764b29b8aac8a773600102000203007b8017722f7ada93dc8cab8b5b89e26588a305fff7f3106a514264f3f7c458c9bd5f400000000000000000000000000000000000000000000000000000003000480c9f9284461c852b00000000000000000000000000010000000000000000000000000001ec76defc"

	// ExecutionStateChanged BOCs - 3 states (in-progress, success, failure)
	ExecutionStateChangedInProgressBOC = "b5ee9c724101010100330000620c9f9284461c852b00000000000000010000000000000000000000000000000000000000000000000000000000000001016423df08"
	ExecutionStateChangedSuccessBOC    = "b5ee9c724101010100330000620c9f9284461c852b000000000000000100000000000000000000000000000000000000000000000000000000000000010290d08f1b"
	ExecutionStateChangedFailureBOC    = "b5ee9c724101010100330000620c9f9284461c852b00000000000000010000000000000000000000000000000000000000000000000000000000000001039353e4e9"
)

// ccipBOCTestCase represents a test case with a BOC and its metadata
type ccipBOCTestCase struct {
	name   string
	bocHex string
}

// getAllCCIPBOCs returns all 9 CCIP BOC test cases
func getAllCCIPBOCs() []ccipBOCTestCase {
	return []ccipBOCTestCase{
		{"CCIPMessageSent_Seq1", CCIPMessageSentSeq1BOC},
		{"CCIPMessageSent_Seq2", CCIPMessageSentSeq2BOC},
		{"CCIPMessageSent_Seq3", CCIPMessageSentSeq3BOC},
		{"CommitReportAccepted_MerkleRootOnly", CommitReportAcceptedMerkleRootOnlyBOC},
		{"CommitReportAccepted_PriceOnly", CommitReportAcceptedPriceOnlyBOC},
		{"CommitReportAccepted_Both", CommitReportAcceptedBothBOC},
		{"ExecutionStateChanged_InProgress", ExecutionStateChangedInProgressBOC},
		{"ExecutionStateChanged_Success", ExecutionStateChangedSuccessBOC},
		{"ExecutionStateChanged_Failure", ExecutionStateChangedFailureBOC},
	}
}

// TestHeaderLenSimple tests basic functionality with simple synthetic BOCs
func TestHeaderLenSimple(t *testing.T) {
	tests := []struct {
		name           string
		createCell     func() *cell.Cell
		withCRC        bool
		expectedHeader int
	}{
		{
			name:           "empty_cell",
			createCell:     func() *cell.Cell { return tvm.EmptyCell },
			withCRC:        true,
			expectedHeader: 11,
		},
		{
			name:           "single_uint32",
			createCell:     func() *cell.Cell { return cell.BeginCell().MustStoreUInt(0x12345678, 32).EndCell() },
			withCRC:        true,
			expectedHeader: 11,
		},
		{
			name: "cell_with_one_ref",
			createCell: func() *cell.Cell {
				ref := cell.BeginCell().MustStoreUInt(0xABCD, 16).EndCell()
				return cell.BeginCell().MustStoreUInt(0x1234, 16).MustStoreRef(ref).EndCell()
			},
			withCRC:        true,
			expectedHeader: 11,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := tt.createCell()
			boc := c.ToBOCWithFlags(tt.withCRC)

			headerLen, err := HeaderLen(boc)
			require.NoError(t, err)
			require.Equal(t, tt.expectedHeader, headerLen)

			// Verify we can split and reconstruct
			header := boc[:headerLen]
			payload := boc[headerLen:]
			reconstructed := make([]byte, 0, len(header)+len(payload))
			reconstructed = append(reconstructed, header...)
			reconstructed = append(reconstructed, payload...)
			require.Equal(t, boc, reconstructed)
		})
	}
}

// TestHeaderLenErrors tests error conditions
func TestHeaderLenErrors(t *testing.T) {
	tests := []struct {
		name        string
		boc         []byte
		expectedErr string
	}{
		{
			name:        "empty_data",
			boc:         []byte{},
			expectedErr: "minimum 6 bytes required",
		},
		{
			name:        "too_small_1_byte",
			boc:         []byte{0xB5},
			expectedErr: "minimum 6 bytes required",
		},
		{
			name:        "too_small_5_bytes",
			boc:         []byte{0xB5, 0xEE, 0x9C, 0x72, 0x01},
			expectedErr: "minimum 6 bytes required",
		},
		{
			name:        "truncated_header",
			boc:         []byte{0xB5, 0xEE, 0x9C, 0x72, 0x01, 0x01, 0x00}, // claims more data than available
			expectedErr: "too small for base header size",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := HeaderLen(tt.boc)
			require.Error(t, err)
			require.Contains(t, err.Error(), tt.expectedErr)
		})
	}
}

// TestCCIPBOCsAreValid verifies all 9 CCIP BOCs can be decoded
func TestCCIPBOCsAreValid(t *testing.T) {
	for _, tc := range getAllCCIPBOCs() {
		t.Run(tc.name, func(t *testing.T) {
			bocBytes, err := hex.DecodeString(tc.bocHex)
			require.NoError(t, err)

			parsedCell, err := cell.FromBOC(bocBytes)
			require.NoError(t, err)
			require.NotNil(t, parsedCell)
		})
	}
}

// TestHeaderLenCorrectness verifies that HeaderLen() correctly
// splits BOCs and allows proper reconstruction for all 9 CCIP event types
func TestHeaderLenCorrectness(t *testing.T) {
	for _, tc := range getAllCCIPBOCs() {
		t.Run(tc.name, func(t *testing.T) {
			originalBOC, err := hex.DecodeString(tc.bocHex)
			require.NoError(t, err)

			originalCell, err := cell.FromBOC(originalBOC)
			require.NoError(t, err)

			headerLen, err := HeaderLen(originalBOC)
			require.NoError(t, err)
			require.Greater(t, headerLen, 5)
			require.Less(t, headerLen, len(originalBOC))

			// Split and reconstruct
			header := originalBOC[:headerLen]
			payload := originalBOC[headerLen:]
			reconstructedBOC := make([]byte, 0, len(header)+len(payload))
			reconstructedBOC = append(reconstructedBOC, header...)
			reconstructedBOC = append(reconstructedBOC, payload...)

			require.Equal(t, originalBOC, reconstructedBOC)

			// Verify reconstructed cell matches
			reconstructedCell, err := cell.FromBOC(reconstructedBOC)
			require.NoError(t, err)
			require.Equal(t, originalCell.Hash(), reconstructedCell.Hash())
		})
	}
}

// TestPayloadByteFiltering verifies that we can correctly extract known field values
// from the payload at calculated byte offsets for CCIP events
func TestPayloadByteFiltering(t *testing.T) {
	t.Run("ExecutionStateChanged_Events", func(t *testing.T) {
		testCases := []struct {
			name                   string
			bocHex                 string
			expectedSourceChain    uint64
			expectedSequenceNumber uint64
			expectedState          uint8
		}{
			{
				name:                   "InProgress",
				bocHex:                 ExecutionStateChangedInProgressBOC,
				expectedSourceChain:    909606746561742123,
				expectedSequenceNumber: 1,
				expectedState:          1, // IN_PROGRESS
			},
			{
				name:                   "Success",
				bocHex:                 ExecutionStateChangedSuccessBOC,
				expectedSourceChain:    909606746561742123,
				expectedSequenceNumber: 1,
				expectedState:          2, // SUCCESS
			},
			{
				name:                   "Failure",
				bocHex:                 ExecutionStateChangedFailureBOC,
				expectedSourceChain:    909606746561742123,
				expectedSequenceNumber: 1,
				expectedState:          3, // FAILURE
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				bocBytes, err := hex.DecodeString(tc.bocHex)
				require.NoError(t, err)

				bocCell, err := cell.FromBOC(bocBytes)
				require.NoError(t, err)

				var execEvent offramp.ExecutionStateChanged
				err = tlb.LoadFromCell(&execEvent, bocCell.BeginParse(), true)
				require.NoError(t, err)

				require.Equal(t, tc.expectedSourceChain, execEvent.SourceChainSelector)
				require.Equal(t, tc.expectedSequenceNumber, execEvent.SequenceNumber)
				require.Equal(t, tc.expectedState, execEvent.State)

				// Verify we can extract fields from payload at correct offsets
				headerLen, err := HeaderLen(bocBytes)
				require.NoError(t, err)

				payload := bocBytes[headerLen:]
				cellData := payload[CellDescriptorSize:]

				// Extract fields at known offsets
				require.GreaterOrEqual(t, len(cellData), 49)
				extractedSourceChain := binary.BigEndian.Uint64(cellData[0:8])
				extractedSeqNum := binary.BigEndian.Uint64(cellData[8:16])
				extractedState := cellData[48]

				require.Equal(t, tc.expectedSourceChain, extractedSourceChain)
				require.Equal(t, tc.expectedSequenceNumber, extractedSeqNum)
				require.Equal(t, tc.expectedState, extractedState)
			})
		}
	})

	// Test CCIPMessageSent events
	t.Run("CCIPMessageSent_Events", func(t *testing.T) {
		testCases := []struct {
			name            string
			bocHex          string
			expectedSeqNum  uint64
			expectedDestSel uint64
			expectedSrcSel  uint64
		}{
			{
				name:            "Seq1",
				bocHex:          CCIPMessageSentSeq1BOC,
				expectedSeqNum:  1,
				expectedDestSel: 909606746561742123,
				expectedSrcSel:  13879075125137744094,
			},
			{
				name:            "Seq2",
				bocHex:          CCIPMessageSentSeq2BOC,
				expectedSeqNum:  2,
				expectedDestSel: 909606746561742123,
				expectedSrcSel:  13879075125137744094,
			},
			{
				name:            "Seq3",
				bocHex:          CCIPMessageSentSeq3BOC,
				expectedSeqNum:  3,
				expectedDestSel: 909606746561742123,
				expectedSrcSel:  13879075125137744094,
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				bocBytes, err := hex.DecodeString(tc.bocHex)
				require.NoError(t, err)

				bocCell, err := cell.FromBOC(bocBytes)
				require.NoError(t, err)

				var msgEvent onramp.CCIPMessageSent
				err = tlb.LoadFromCell(&msgEvent, bocCell.BeginParse(), true)
				require.NoError(t, err)

				require.Equal(t, tc.expectedSeqNum, msgEvent.Message.Header.SequenceNumber)
				require.Equal(t, tc.expectedDestSel, msgEvent.Message.Header.DestChainSelector)
				require.Equal(t, tc.expectedSrcSel, msgEvent.Message.Header.SourceChainSelector)

				// Verify payload extraction works
				headerLen, err := HeaderLen(bocBytes)
				require.NoError(t, err)

				payload := bocBytes[headerLen:]
				cellData := payload[CellDescriptorSize:]
				require.NotEmpty(t, cellData)
			})
		}
	})
}

// TestBOCHeaderVariability creates synthetic BOCs with different structures
// to verify HeaderLen handles variable header sizes correctly
func TestBOCHeaderVariability(t *testing.T) {
	testCases := []struct {
		name               string
		createCell         func() *cell.Cell
		flags              []bool // withCRC, withIndex, withCache
		expectedHeaderSize int    // exact expected header size (deterministic!)
	}{
		{
			name: "simple_cell_no_crc",
			createCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreUInt(0xABCD, 16).EndCell()
			},
			flags: []bool{false}, // no CRC
			// 1 cell, 1 root, cellSizeBytes=1, sizeBytes=1, no index
			// Formula: 6 + (3×1) + 1 + (1×1) = 11 bytes
			expectedHeaderSize: 11,
		},
		{
			name: "simple_cell_with_crc",
			createCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreUInt(0x12345678, 32).EndCell()
			},
			flags: []bool{true}, // with CRC
			// 1 cell, 1 root, cellSizeBytes=1, sizeBytes=1, no index
			// Formula: 6 + (3×1) + 1 + (1×1) = 11 bytes
			expectedHeaderSize: 11,
		},
		{
			name: "simple_cell_with_index",
			createCell: func() *cell.Cell {
				return cell.BeginCell().MustStoreUInt(0xDEADBEEF, 32).EndCell()
			},
			flags: []bool{true, true}, // CRC + index
			// 1 cell, 1 root, cellSizeBytes=1, sizeBytes=1, WITH index
			// Formula: 6 + (3×1) + 1 + (1×1) + (1×1) = 12 bytes
			expectedHeaderSize: 12,
		},
		{
			name: "complex_cell_tree",
			createCell: func() *cell.Cell {
				// Create a cell tree with multiple refs to increase cell count
				ref1 := cell.BeginCell().MustStoreUInt(0x1111, 16).EndCell()
				ref2 := cell.BeginCell().MustStoreUInt(0x2222, 16).EndCell()
				ref3 := cell.BeginCell().MustStoreUInt(0x3333, 16).EndCell()
				return cell.BeginCell().
					MustStoreUInt(0xAAAA, 16).
					MustStoreRef(ref1).
					MustStoreRef(ref2).
					MustStoreRef(ref3).
					EndCell()
			},
			flags: []bool{true}, // with CRC
			// 4 cells total, 1 root, cellSizeBytes=1, sizeBytes=1, no index
			// Formula: 6 + (3×1) + 1 + (1×1) = 11 bytes
			expectedHeaderSize: 11,
		},
		{
			name: "large_data_cell",
			createCell: func() *cell.Cell {
				// Create cell with more data (but still within TON limits)
				data := make([]byte, 100)
				for i := range data {
					data[i] = byte(i)
				}
				return cell.BeginCell().MustStoreSlice(data, 800).EndCell()
			},
			flags: []bool{true}, // with CRC
			// 1 cell, 1 root, cellSizeBytes=1, sizeBytes=1, no index
			// Formula: 6 + (3×1) + 1 + (1×1) = 11 bytes
			expectedHeaderSize: 11,
		},
		{
			name: "wide_unique_cell_tree",
			createCell: func() *cell.Cell {
				// Create many UNIQUE cells to force cellSizeBytes=2 (256+ unique cells)
				// Each cell must be unique to avoid deduplication
				cells := make([]*cell.Cell, 0, 300)

				// Create 300 unique leaf cells
				for i := range 300 {
					cells = append(cells, cell.BeginCell().
						MustStoreUInt(uint64(i*1000+i), 32).
						MustStoreUInt(uint64(i*2), 16).
						EndCell())
				}

				// Build parent cells that reference unique children
				// Group into batches of 4
				for len(cells) > 1 {
					var newLevel []*cell.Cell
					for i := 0; i < len(cells); i += 4 {
						builder := cell.BeginCell().MustStoreUInt(uint64(i), 16)

						if i < len(cells) {
							builder.MustStoreRef(cells[i])
						}
						if i+1 < len(cells) {
							builder.MustStoreRef(cells[i+1])
						}
						if i+2 < len(cells) {
							builder.MustStoreRef(cells[i+2])
						}
						if i+3 < len(cells) {
							builder.MustStoreRef(cells[i+3])
						}

						newLevel = append(newLevel, builder.EndCell())
					}
					cells = newLevel
				}

				return cells[0]
			},
			flags: []bool{true}, // with CRC
			// ~400 cells total, 1 root, cellSizeBytes=2, sizeBytes=2, no index
			// Formula: 6 + (3×2) + 2 + (1×2) = 16 bytes
			expectedHeaderSize: 16,
		},
	}

	headerSizeDistribution := make(map[int]int)

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			testCell := tc.createCell()
			bocBytes := testCell.ToBOCWithFlags(tc.flags...)

			headerLen, err := HeaderLen(bocBytes)
			require.NoError(t, err)
			require.Equal(t, tc.expectedHeaderSize, headerLen)

			// Verify split/reconstruct works
			header := bocBytes[:headerLen]
			payload := bocBytes[headerLen:]
			reconstructed := make([]byte, 0, len(header)+len(payload))
			reconstructed = append(reconstructed, header...)
			reconstructed = append(reconstructed, payload...)
			require.Equal(t, bocBytes, reconstructed)

			// Verify cell can be parsed from reconstructed BOC
			reconstructedCell, err := cell.FromBOC(reconstructed)
			require.NoError(t, err)
			require.Equal(t, testCell.Hash(), reconstructedCell.Hash())

			// Track header size distribution
			headerSizeDistribution[headerLen]++
		})
	}

	// Verify we saw multiple different header sizes
	require.GreaterOrEqual(t, len(headerSizeDistribution), 3,
		"Should see at least 3 different header sizes (11, 12, 16 bytes)")
}
