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

	// Valid ranges of the header descriptors, as enforced by tonutils-go/tvm/cell/parse.go.
	minCellSizeBytes   = 1 // size:(## 3) { size <= 4 }
	maxCellSizeBytes   = 4
	minOffsetSizeBytes = 1 // off_bytes:(## 8) { off_bytes <= 8 }
	maxOffsetSizeBytes = 8
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

	// The descriptors must be in the ranges the BOC format allows, matching tonutils-go's parser.
	if cellSizeBytes < minCellSizeBytes || cellSizeBytes > maxCellSizeBytes {
		return 0, fmt.Errorf("invalid BOC size descriptor %d: must be between %d and %d", cellSizeBytes, minCellSizeBytes, maxCellSizeBytes)
	}
	if sizeBytes < minOffsetSizeBytes || sizeBytes > maxOffsetSizeBytes {
		return 0, fmt.Errorf("invalid BOC offset descriptor %d: must be between %d and %d", sizeBytes, minOffsetSizeBytes, maxOffsetSizeBytes)
	}

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
	rootsSize, err := sectionSize(rootsNum, cellSizeBytes, len(data)-baseHeaderSize)
	if err != nil {
		return 0, fmt.Errorf("invalid BOC root indices (rootsNum %d): %w", rootsNum, err)
	}
	headerSize := baseHeaderSize + rootsSize

	// Add optional index section
	if hasIndex {
		cellsNumOffset := bocHeaderFixedSize
		if cellsNumOffset+cellSizeBytes > len(data) {
			return 0, fmt.Errorf("BOC too small to read cellsNum at offset %d", cellsNumOffset)
		}
		cellsNum := readDynamicInt(data[cellsNumOffset : cellsNumOffset+cellSizeBytes])
		indexSize, err := sectionSize(cellsNum, sizeBytes, len(data)-headerSize)
		if err != nil {
			return 0, fmt.Errorf("invalid BOC index (cellsNum %d): %w", cellsNum, err)
		}
		headerSize += indexSize
	}

	if len(data) < headerSize {
		return 0, fmt.Errorf("BOC too small for calculated header size %d, actual size %d", headerSize, len(data))
	}

	return headerSize, nil
}

// sectionSize returns count*elemSize, the byte size of a header section of count elements,
// and errors if it exceeds the available bytes. Checking against available before multiplying
// keeps the product from overflowing, since count comes from untrusted header bytes.
func sectionSize(count uint64, elemSize, available int) (int, error) {
	if available < 0 {
		return 0, errors.New("no data left for section")
	}
	if elemSize <= 0 {
		return 0, fmt.Errorf("invalid element size %d", elemSize)
	}
	if count > uint64(available)/uint64(elemSize) { //nolint:gosec // G115: available and elemSize are non-negative
		return 0, fmt.Errorf("section of %d elements of %d bytes exceeds the %d bytes available", count, elemSize, available)
	}
	return int(count) * elemSize, nil //nolint:gosec // G115: count <= available/elemSize, so it fits in int
}

// readDynamicInt reads a big-endian unsigned integer of up to 8 bytes.
// The caller must ensure len(data) <= 8.
// Reference: tonutils-go/tvm/cell/parse.go:229-234 dynInt()
func readDynamicInt(data []byte) uint64 {
	tmp := make([]byte, 8)
	copy(tmp[8-len(data):], data)
	return binary.BigEndian.Uint64(tmp)
}
