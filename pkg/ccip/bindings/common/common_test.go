package common //nolint:revive,nolintlint // TODO: move to pkg/ton/tlbe

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestCrossChainAddress_ToCell(t *testing.T) {
	tests := []struct {
		name      string
		addr      CrossChainAddress
		expectErr bool
	}{
		{"empty address", CrossChainAddress{}, true},
		{"too short", CrossChainAddress{0x05}, false},
		{"valid address", CrossChainAddress{0x01, 0xFF}, false},
		{"too long", CrossChainAddress(make([]byte, 66)), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := tt.addr.ToCell()
			if tt.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.NotNil(t, c)
			}
		})
	}
}

func TestCrossChainAddress_LoadFromCell(t *testing.T) {
	tests := []struct {
		name      string
		setupData []byte
		expectErr bool
	}{
		{"valid data", []byte{0x01, 0xFF}, false},
		{"invalid length", []byte{0x00}, true},
		{"too long", []byte{0x41}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			builder := cell.BeginCell()
			err := builder.StoreSlice(tt.setupData, uint(len(tt.setupData))*8)
			require.NoError(t, err)

			c := builder.EndCell()
			var addr CrossChainAddress
			err = addr.LoadFromCell(c.BeginParse())

			if tt.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tt.setupData[1:], []byte(addr))
			}
		})
	}
}

func TestCrossChainAddress_RoundTrip(t *testing.T) {
	original := CrossChainAddress{0x05, 0x01, 0x02, 0x03, 0x04, 0x05}

	c, err := original.ToCell()
	require.NoError(t, err)
	require.Equal(t, uint(56), c.BitsSize(), "CrossChainAddress should be 56 bits (7 bytes)")

	var restored CrossChainAddress
	err = restored.LoadFromCell(c.BeginParse())
	require.NoError(t, err)

	require.Equal(t, original, restored)
}

func TestPackAndUnloadCellToByteArray(t *testing.T) {
	tests := []struct {
		name      string
		input     []byte
		expectErr bool
	}{
		{"empty", []byte{}, false},
		{"short", []byte("hello"), false},
		{"long", make([]byte, 1024), false},
		{"very long", make([]byte, MaxCellChainBytes), false},
		{"too long", make([]byte, MaxCellChainBytes+1), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := packByteArrayToCell(tt.input)
			if tt.expectErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			output, err := unloadCellToByteArray(c)
			require.NoError(t, err)
			require.Equal(t, tt.input, output)
		})
	}
}

func TestPackAndUnpack2DByteArrayToCell(t *testing.T) {
	tests := []struct {
		name      string
		input     SnakeRef[SnakeBytes]
		expectErr bool
	}{
		// Basic cases
		// Note no empty arrays, as they are not allowed in SnakeRef
		{"empty", SnakeRef[SnakeBytes]{[]byte{}}, false},
		{"single empty", SnakeRef[SnakeBytes]{{}}, false},
		{"single short", SnakeRef[SnakeBytes]{[]byte("abc")}, false},
		{"multiple short", SnakeRef[SnakeBytes]{[]byte("abc"), []byte("defg")}, false},

		// Size boundary cases - stay within MaxCellChainBytes limit (65,024 bytes)
		{"under max length array", SnakeRef[SnakeBytes]{make([]byte, 50_000)}, false},
		{"exceed max length array", SnakeRef[SnakeBytes]{make([]byte, MaxCellChainBytes+1)}, true},

		// Mixed sizes
		{"mixed empty and data", SnakeRef[SnakeBytes]{{}, []byte("test"), {}, []byte("data")}, false},
		{"many empty arrays", func() SnakeRef[SnakeBytes] {
			arrays := make(SnakeRef[SnakeBytes], 100)
			for i := range arrays {
				arrays[i] = []byte{}
			}
			return arrays
		}(), false},

		// Cell capacity edge cases
		{"large number of small arrays", func() SnakeRef[SnakeBytes] {
			arrays := make(SnakeRef[SnakeBytes], 500)
			for i := range arrays {
				arrays[i] = []byte{byte(i % 256)}
			}
			return arrays
		}(), false},

		{"arrays that span multiple cells", SnakeRef[SnakeBytes]{
			make([]byte, 1000),
			make([]byte, 1000),
			make([]byte, 1000),
		}, false},

		// Bit alignment edge cases
		{"single byte arrays", SnakeRef[SnakeBytes]{
			{0x01}, {0x02}, {0x03}, {0x04}, {0x05},
		}, false},

		{"exactly 127 bytes (fits in one cell with length)", SnakeRef[SnakeBytes]{
			make([]byte, 127), // 127*8 + 16 = 1032 bits (fits in 1023 bits available)
		}, false},

		{"128 bytes (requires cell split)", SnakeRef[SnakeBytes]{
			make([]byte, 128), // 128*8 + 16 = 1040 bits (exceeds 1023)
		}, false},

		// Many small arrays that require multiple cells
		{"many tiny arrays", func() SnakeRef[SnakeBytes] {
			arrays := make(SnakeRef[SnakeBytes], 200)
			for i := range arrays {
				arrays[i] = []byte{byte(i % 256), byte((i + 1) % 256)}
			}
			return arrays
		}(), false},

		// Pathological cases
		{"alternating empty and large size", SnakeRef[SnakeBytes]{
			{},
			make([]byte, 1000),
			{},
			make([]byte, 1000),
		}, false},

		// Stress test with various sizes
		{"random sizes", func() SnakeRef[SnakeBytes] {
			sizes := []int{0, 1, 10, 100, 500, 1000, 5000, 10000}
			arrays := make(SnakeRef[SnakeBytes], len(sizes))
			for i, size := range sizes {
				arrays[i] = make([]byte, size)
				// Fill with pattern for verification
				for j := range arrays[i] {
					arrays[i][j] = byte((i + j) % 256)
				}
			}
			return arrays
		}(), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Note: ToCell() enforces per-cell data limits (127 bytes) via Builder operations,
			// but does NOT enforce chain depth limits (512 cells for c4/c5). Cell chains
			// exceeding depth limits can be created locally but will fail during LoadFromCell
			// validation, matching TON blockchain behavior where depth limits are enforced
			// during smart contract execution (specifically for c4/c5 registers).
			c, err := tlb.ToCell(tt.input)
			if tt.expectErr {
				require.Error(t, err, "LoadFromCell should fail due to platform limits")
				return
			}
			require.NoError(t, err, "ToCell should succeed - depth limits enforced during LoadFromCell")

			var output SnakeRef[SnakeBytes]
			err = tlb.LoadFromCell(&output, c.BeginParse())
			require.NoError(t, err)
			require.Len(t, tt.input, len(output), "array count mismatch")

			for i, expected := range tt.input {
				require.Equal(t, expected, output[i], "array %d content mismatch", i)
			}
		})
	}
}

func TestPackAndUnpack2DByteArrayToCell_CellStructure(t *testing.T) {
	t.Run("cell count for large dataset", func(t *testing.T) {
		// Create 1000 arrays of 10 bytes each
		arrays := make(SnakeRef[SnakeBytes], 1000)
		for i := range arrays {
			arrays[i] = make([]byte, 100)
		}

		c, err := tlb.ToCell(arrays)
		require.NoError(t, err)

		// Verify unpacking works correctly
		var output SnakeRef[SnakeBytes]
		err = tlb.LoadFromCell(&output, c.BeginParse())
		require.NoError(t, err)
		require.Len(t, arrays, len(output))

		// With SnakeRef, each array element becomes a cell reference
		// Plus chaining references for the structure
		// Expect: 1000 data refs + ~250 chain refs = ~1250 total refs
		cellCount, err := getTotalReference(c)
		require.NoError(t, err)
		require.Equal(t, uint(1333), cellCount, "should have at least 1000 data references")
	})

	t.Run("cell count for large dataset", func(t *testing.T) {
		// Create 1000 arrays of 10 bytes each
		arrays := make(SnakeRef[SnakeBytes], 1000)
		for i := range arrays {
			arrays[i] = make([]byte, 130)
		}

		c, err := tlb.ToCell(arrays)
		require.NoError(t, err)

		// Verify unpacking works correctly
		var output SnakeRef[SnakeBytes]
		err = tlb.LoadFromCell(&output, c.BeginParse())
		require.NoError(t, err)
		require.Len(t, arrays, len(output))

		// Data references: 1000 (one per array element in SnakeRef)
		// Internal references: 1000 (one per 130-byte SnakeBytes that spans 2 cells)
		// Chain references: ⌊1000/3⌋ = 333 (for SnakeRef chaining)
		// Total references: 1000 + 1000 + 333 = 2333 references
		cellCount, err := getTotalReference(c)
		require.NoError(t, err)
		require.Equal(t, uint(2333), cellCount, "should have at least 1000 data references")
	})

	t.Run("handles cell boundaries correctly", func(t *testing.T) {
		// Create arrays that will definitely span multiple cells
		arrays := SnakeRef[SnakeBytes]{
			make([]byte, 200), // Forces new cell for data
			make([]byte, 200),
			make([]byte, 200),
		}

		c, err := tlb.ToCell(arrays)
		require.NoError(t, err)

		var output SnakeRef[SnakeBytes]
		err = tlb.LoadFromCell(&output, c.BeginParse())
		require.NoError(t, err)
		require.Equal(t, arrays, output)
	})
}

type tokenPriceUpdate struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken *big.Int         `tlb:"## 256"`
}

type merkleRoot struct {
	SourceChainSelector uint64 `tlb:"## 64"`
	OnRampAddress       []byte `tlb:"bits 512"`
	MinSeqNr            uint64 `tlb:"## 64"`
	MaxSeqNr            uint64 `tlb:"## 64"`
	MerkleRoot          []byte `tlb:"bits 256"`
}

func TestLoadArray_LoadToArrayFitMultipleInSingleCell(t *testing.T) {
	slice := []tokenPriceUpdate{
		{
			UsdPerToken: big.NewInt(1000000),
		},
		{
			UsdPerToken: big.NewInt(2000000),
		},
		{
			UsdPerToken: big.NewInt(3000000),
		},
		{
			UsdPerToken: big.NewInt(4000000),
		},
		{
			UsdPerToken: big.NewInt(5000000),
		},
	}
	c, err := packArrayWithStaticType(slice)
	require.NoError(t, err)

	// For this test, each token update is only 258 bits, so we can fit up to 3 of them in a single cell.
	// we only need two cells to store 5 elements, so c should have 1 ref.
	refNum, err := getTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(1), refNum)

	// first cell has 3 elements, second cell has 2 elements
	require.Equal(t, uint(258*3), c.BitsSize())
	ref, err := c.PeekRef(0)
	require.NoError(t, err)
	require.Equal(t, uint(258*2), ref.BitsSize())

	array, err := unpackArrayWithStaticType[tokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)
}

func TestLoadArray_FitSingleUpdateInSingleCell_TokenUpdates(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	slice := []tokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(2000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(3000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(4000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(5000000),
		},
	}
	c, err := packArrayWithStaticType(slice)
	require.NoError(t, err)

	array, err := unpackArrayWithStaticType[tokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)

	// For this test, each token update is only 523 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 5 elements
	refNum, err := getTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(4), refNum)
	for range 4 {
		c, err = c.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(523), c.BitsSize())
	}
}

func TestLoadArray_FitSingleUpdateInSingleCell_MerkleRoots(t *testing.T) {
	merkleRoots, err := packArrayWithStaticType([]merkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.NoError(t, err)
	array, err := unpackArrayWithStaticType[merkleRoot](merkleRoots)
	require.NoError(t, err)
	require.Len(t, array, 3)

	// For this test, each token update is only 960 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 3 elements
	refNum, err := getTotalReference(merkleRoots)
	require.NoError(t, err)
	require.Equal(t, uint(2), refNum)
	for range 2 {
		merkleRoots, err = merkleRoots.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(960), merkleRoots.BitsSize())
	}
}

func TestLoadArray_AddressTooSmall(t *testing.T) {
	// Note: for OnRampAddress that requires 64 bytes length, if the address bytes is smaller than 64, tlb.toCell() will return error, if bytes array is more than 64 bytes, only first 512 bits will be used.
	_, err := packArrayWithStaticType([]merkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 63),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.EqualError(t, err, "failed to serialize element 0: failed to serialize field OnRampAddress to cell: failed to store bits 512, err: too small slice for this size")

	_, err = packArrayWithStaticType([]merkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 31),
		},
	})
	require.EqualError(t, err, "failed to serialize element 0: failed to serialize field MerkleRoot to cell: failed to store bits 256, err: too small slice for this size")
}

func getTotalReference(c *cell.Cell) (uint, error) {
	totalRefs := c.RefsNum()
	for i := uint(0); i < c.RefsNum(); i++ {
		if i > uint(math.MaxInt) {
			return 0, fmt.Errorf("reference index %d exceeds math.MaxInt", i)
		}
		ref, err := c.PeekRef(int(i))
		if err == nil && ref != nil {
			subRefs, subErr := getTotalReference(ref)
			if subErr != nil {
				return 0, subErr
			}
			totalRefs += subRefs
		}
	}
	return totalRefs, nil
}

// Test validation for LoadCrossChainAddressWithoutPrefix
func TestLoadCrossChainAddressWithoutPrefix_Validation(t *testing.T) {
	tests := []struct {
		name      string
		setupFunc func() *cell.Slice
		expectErr string
	}{
		{
			name: "valid address",
			setupFunc: func() *cell.Slice {
				builder := cell.BeginCell()
				addr := []byte{0x01, 0x02, 0x03, 0x04, 0x05}
				_ = builder.StoreSlice(addr, uint(len(addr))*8)
				return builder.EndCell().BeginParse()
			},
			expectErr: "",
		},
		{
			name: "empty address",
			setupFunc: func() *cell.Slice {
				builder := cell.BeginCell()
				return builder.EndCell().BeginParse()
			},
			expectErr: "crosschain address is empty",
		},
		{
			name: "address exceeds 64 bytes",
			setupFunc: func() *cell.Slice {
				builder := cell.BeginCell()
				addr := make([]byte, 65)
				_ = builder.StoreSlice(addr, uint(len(addr))*8)
				return builder.EndCell().BeginParse()
			},
			expectErr: "exceeds maximum of 64 bytes",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slice := tt.setupFunc()
			addr, err := LoadCrossChainAddressWithoutPrefix(slice)

			if tt.expectErr != "" {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.expectErr)
				require.Nil(t, addr)
			} else {
				require.NoError(t, err)
				require.NotNil(t, addr)
			}
		})
	}
}

// Test validation for unloadCellToByteArray
func TestUnloadCellToByteArray_Validation(t *testing.T) {
	t.Run("exceeds maximum cell chain depth", func(t *testing.T) {
		// Create a cell chain that exceeds MaxCellChainDepth
		builder := cell.BeginCell()
		_ = builder.StoreSlice([]byte{0x01}, 8)
		root := builder.EndCell()

		// Build a chain longer than MaxCellChainDepth
		for i := 0; i < MaxCellChainDepth+1; i++ {
			builder = cell.BeginCell()
			_ = builder.StoreSlice([]byte{0x01}, 8)
			_ = builder.StoreRef(root)
			root = builder.EndCell()
		}

		_, err := unloadCellToByteArray(root)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of")
		require.Contains(t, err.Error(), "cells")
	})

	t.Run("exceeds platform limits", func(t *testing.T) {
		// Create a byte array that would exceed MaxCellChainBytes if cells were infinite
		// In practice, this will hit the depth limit first since:
		// MaxCellChainBytes = 512 cells * 127 bytes = 65,024 bytes
		// So creating > 65KB of data requires > 512 cells
		largeData := make([]byte, MaxCellChainBytes+1000)
		_, err := packByteArrayToCell(largeData)
		require.Contains(t, err.Error(), "exceeds maximum of")
		// Either "cells" or "bytes" is acceptable
	})

	t.Run("valid cell chain within limits", func(t *testing.T) {
		// Create a valid cell chain well within limits
		testData := []byte("test data")
		c, err := packByteArrayToCell(testData)
		require.NoError(t, err)

		result, err := unloadCellToByteArray(c)
		require.NoError(t, err)
		require.Equal(t, testData, result)
	})
}

// Test validation for unpackArrayWithRefChaining
func TestUnpackArrayWithRefChaining_Validation(t *testing.T) {
	t.Run("exceeds maximum cell chain depth", func(t *testing.T) {
		// Create a cell chain that exceeds MaxCellChainDepth by building a deep chain
		// Start with a valid element cell
		elemBuilder := cell.BeginCell()
		_ = elemBuilder.StoreSlice([]byte{0x01}, 8)
		elemCell := elemBuilder.EndCell()

		// Build initial cell with 3 data refs and 1 chain ref
		builder := cell.BeginCell()
		for range 3 {
			_ = builder.StoreRef(elemCell)
		}
		// Add a chain ref to continue
		chainBuilder := cell.BeginCell()
		_ = chainBuilder.StoreRef(elemCell)
		chainCell := chainBuilder.EndCell()
		_ = builder.StoreRef(chainCell)
		root := builder.EndCell()

		// Now extend the chain beyond MaxCellChainDepth
		for i := 0; i < MaxCellChainDepth; i++ {
			builder = cell.BeginCell()
			for j := 0; j < 3; j++ {
				_ = builder.StoreRef(elemCell)
			}
			_ = builder.StoreRef(root)
			root = builder.EndCell()
		}

		_, err := unpackArrayWithRefChaining[SnakeBytes](root)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of 1000")
	})

	t.Run("valid ref chain within limits", func(t *testing.T) {
		// Create a valid array well within limits
		testArray := SnakeRef[SnakeBytes]{
			[]byte{0x01, 0x02},
			[]byte{0x03, 0x04},
			[]byte{0x05, 0x06},
		}
		c, err := tlb.ToCell(testArray)
		require.NoError(t, err)

		result, err := unpackArrayWithRefChaining[SnakeBytes](c)
		require.NoError(t, err)
		require.Len(t, result, len(testArray))
	})
}

// Test validation for unpackArrayWithStaticType
func TestUnpackArrayWithStaticType_Validation(t *testing.T) {
	t.Run("exceeds maximum cell chain depth", func(t *testing.T) {
		// Create a cell chain that exceeds MaxCellChainDepth using SnakeBytes
		// which uses the same unpacking function
		// Create a long byte array that will be split across many cells
		largeData := make([]byte, MaxCellChainDepth*127+100)
		_, err := packByteArrayToCell(largeData)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of")
	})

	t.Run("valid static array within limits", func(t *testing.T) {
		// Create a valid array well within limits
		testArray := []tokenPriceUpdate{
			{UsdPerToken: big.NewInt(1000000)},
			{UsdPerToken: big.NewInt(2000000)},
		}
		c, err := packArrayWithStaticType(testArray)
		require.NoError(t, err)

		result, err := unpackArrayWithStaticType[tokenPriceUpdate](c)
		require.NoError(t, err)
		require.Len(t, result, len(testArray))
	})
}

// Test validation for MaxArrayLength in pack/unpack functions
func TestMaxArrayLength_Validation(t *testing.T) {
	t.Run("packArrayWithRefChaining exceeds max length", func(t *testing.T) {
		// Create an array that exceeds MaxArrayLength
		largeArray := make(SnakeRef[SnakeBytes], MaxArrayLength+1)
		for i := range largeArray {
			largeArray[i] = []byte{byte(i % 256)}
		}

		_, err := packArrayWithRefChaining(largeArray)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of")
		require.Contains(t, err.Error(), strconv.Itoa(MaxArrayLength))
	})

	t.Run("packArrayWithRefChaining at max length succeeds", func(t *testing.T) {
		// Create an array at exactly MaxArrayLength
		maxArray := make(SnakeRef[SnakeBytes], MaxArrayLength)
		for i := range maxArray {
			maxArray[i] = []byte{byte(i % 256)}
		}

		c, err := packArrayWithRefChaining(maxArray)
		require.NoError(t, err)
		require.NotNil(t, c)
	})

	t.Run("unpackArrayWithRefChaining exceeds max length", func(t *testing.T) {
		// Create a manually constructed cell chain that would decode to > MaxArrayLength elements
		// We'll create a chain with 4 refs each, where each ref contains data
		// This should be caught during unpacking
		elemBuilder := cell.BeginCell()
		_ = elemBuilder.StoreSlice([]byte{0x01}, 8)
		elemCell := elemBuilder.EndCell()

		// Build chains that would exceed MaxArrayLength
		// Each cell can have 3 data refs + 1 chain ref
		// We need > 1000 elements, so > 334 cells (1000/3 = 333.33)
		builder := cell.BeginCell()
		_ = builder.StoreRef(elemCell)
		_ = builder.StoreRef(elemCell)
		_ = builder.StoreRef(elemCell)

		root := builder.EndCell()
		for i := 0; i < MaxArrayLength/3+2; i++ {
			builder = cell.BeginCell()
			_ = builder.StoreRef(elemCell)
			_ = builder.StoreRef(elemCell)
			_ = builder.StoreRef(elemCell)
			_ = builder.StoreRef(root)
			root = builder.EndCell()
		}

		_, err := unpackArrayWithRefChaining[SnakeBytes](root)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of")
	})

	t.Run("packArrayWithStaticType exceeds max length", func(t *testing.T) {
		// Create an array that exceeds MaxArrayLength
		largeArray := make([]tokenPriceUpdate, MaxArrayLength+1)
		for i := range largeArray {
			largeArray[i] = tokenPriceUpdate{UsdPerToken: big.NewInt(int64(i))}
		}

		_, err := packArrayWithStaticType(largeArray)
		require.Error(t, err)
		require.Contains(t, err.Error(), "exceeds maximum of")
		require.Contains(t, err.Error(), strconv.Itoa(MaxArrayLength))
	})

	t.Run("packArrayWithStaticType at max length succeeds", func(t *testing.T) {
		// Create an array at exactly MaxArrayLength
		maxArray := make([]tokenPriceUpdate, MaxArrayLength)
		for i := range maxArray {
			maxArray[i] = tokenPriceUpdate{UsdPerToken: big.NewInt(int64(i))}
		}

		c, err := packArrayWithStaticType(maxArray)
		require.NoError(t, err)
		require.NotNil(t, c)
	})
}
