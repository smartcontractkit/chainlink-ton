package boc

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	// CellDescriptorSize is the fixed size of a cell descriptor in the BOC payload.
	// A cell descriptor consists of 2 bytes:
	//   - Byte 0: d1 (refs_descriptor) = refs_num(3 bits) | special(1 bit) | withHashes(1 bit) | levelMask(3 bits)
	//   - Byte 1: d2 (data_descriptor) = data length in half-bytes (4-bit units), range 0-255
	//
	// Reference: tonutils-go/tvm/cell/parse.go:129-145
	CellDescriptorSize = 2
	bocHeaderFixedSize = 6 // BOC header fixed section size: magic(4) + flags(1) + sizeBytes(1)
)

// HeaderLen calculates the header length of a BOC based on its structure.
//
// BOC header structure:
//
//	magic(4) + flags(1) + sizeBytes(1)
//	+ cellsNum(cellSizeBytes) + rootsNum(cellSizeBytes) + completeNum(cellSizeBytes)
//	+ dataLen(sizeBytes)
//	+ rootIndices(rootsNum × cellSizeBytes)
//	+ [optional] index(cellsNum × sizeBytes, if hasIndex=true)
//
// Reference: tonutils-go/tvm/cell/parse.go:32-88
func HeaderLen(data []byte) (int, error) {
	if len(data) < bocHeaderFixedSize {
		return 0, errors.New("BOC too small: minimum 6 bytes required for header")
	}

	// Parse flags and size bytes
	flagsByte := data[4]
	hasIndex := (flagsByte & 0x80) != 0
	cellSizeBytes := int(flagsByte & 0x07)
	sizeBytes := int(data[5])

	// Calculate base header: magic(6) + cellsNum + rootsNum + completeNum + dataLen
	baseHeaderSize := bocHeaderFixedSize + (3 * cellSizeBytes) + sizeBytes

	if len(data) < baseHeaderSize {
		return 0, fmt.Errorf("BOC too small for base header size %d, actual size %d", baseHeaderSize, len(data))
	}

	// Add root indices size
	rootsNumOffset := bocHeaderFixedSize + cellSizeBytes
	if rootsNumOffset+cellSizeBytes > len(data) {
		return 0, fmt.Errorf("BOC too small to read rootsNum at offset %d", rootsNumOffset)
	}
	rootsNum := readDynamicInt(data[rootsNumOffset : rootsNumOffset+cellSizeBytes])
	headerSize := baseHeaderSize + (rootsNum * cellSizeBytes)

	// Add optional index section
	if hasIndex {
		cellsNumOffset := bocHeaderFixedSize
		if cellsNumOffset+cellSizeBytes > len(data) {
			return 0, fmt.Errorf("BOC too small to read cellsNum at offset %d", cellsNumOffset)
		}
		cellsNum := readDynamicInt(data[cellsNumOffset : cellsNumOffset+cellSizeBytes])
		headerSize += cellsNum * sizeBytes
	}

	if len(data) < headerSize {
		return 0, fmt.Errorf("BOC too small for calculated header size %d, actual size %d", headerSize, len(data))
	}

	return headerSize, nil
}

// readDynamicInt reads a big-endian integer from bytes with dynamic size.
// The caller must ensure data has sufficient length.
// Reference: tonutils-go/tvm/cell/parse.go:229-234 dynInt()
func readDynamicInt(data []byte) int {
	tmp := make([]byte, 8)
	copy(tmp[8-len(data):], data)
	val := binary.BigEndian.Uint64(tmp)
	return int(val) //nolint:gosec // G115 - BOC format limits ensure this fits in int range
}
