package common

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestPackAndUnloadCellToByteArray(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
	}{
		{"empty", []byte{}},
		{"short", []byte("hello")},
		{"long", make([]byte, 1024)},
		{"very long", make([]byte, 100_000)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := packByteArrayToCell(tt.input)
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

		// Size boundary cases
		{"max length array", SnakeRef[SnakeBytes]{make([]byte, 0xFFFF)}, false},

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
			c, err := tlb.ToCell(tt.input)

			if tt.expectErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			var output SnakeRef[SnakeBytes]
			err = tlb.LoadFromCell(&output, c.BeginParse())
			require.NoError(t, err)
			require.Equal(t, len(tt.input), len(output), "array count mismatch")

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
		require.Equal(t, len(arrays), len(output))

		// With SnakeRef, each array element becomes a cell reference
		// Plus chaining references for the structure
		// Expect: 1000 data refs + ~250 chain refs = ~1250 total refs
		cellCount, err := GetTotalReference(c)
		require.NoError(t, err)
		require.Equal(t, cellCount, uint(1333), "should have at least 1000 data references")
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
		require.Equal(t, len(arrays), len(output))

		// Data references: 1000 (one per array element in SnakeRef)
		// Internal references: 1000 (one per 130-byte SnakeBytes that spans 2 cells)
		// Chain references: ⌊1000/3⌋ = 333 (for SnakeRef chaining)
		// Total references: 1000 + 1000 + 333 = 2333 references
		cellCount, err := GetTotalReference(c)
		require.NoError(t, err)
		require.Equal(t, cellCount, uint(2333), "should have at least 1000 data references")
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
