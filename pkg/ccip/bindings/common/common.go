package common //nolint:revive,nolintlint // TODO: move to pkg/ton/tlbe

import (
	"errors"
	"fmt"
	"math"
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorUnknownDestChainSelector)
		ecMax = int32(ErrorDispatchNotFromMerkleRoot)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	versionGetter = "typeAndVersion"
)

// TVM limits for cell chains, enforced at different stages:
// - Per-cell limits (MaxCellDataBytes): Enforced by Builder during cell creation
// - Chain depth limits (MaxCellChainDepth): Enforced during TVM execution (not during creation)
//
// The 512-depth limit specifically applies to c4 (persistent storage) and c5 (output actions)
// registers during smart contract execution. Cell chains exceeding this depth can be created
// locally but will fail when used in contract state or validated during blockchain processing.
const (
	// CrossChainAddressMaxLength defines the maximum length for cross-chain addresses.
	CrossChainAddressMaxLength = 64 // in bytes
	// MaxArrayLength defines the maximum length for arrays packed with reference chaining to prevent excessive resource consumption.
	MaxArrayLength = 1000
	// MaxCellChainDepth is the maximum depth for c4/c5 registers in TON (512 cells).
	// General execution depth limit is <1024, but c4/c5 specifically limited to 512.
	MaxCellChainDepth = 512
	// MaxCellDataBytes is the maximum data per cell in TON (127 bytes, ~1023 bits).
	// This limit is enforced during cell creation by Builder operations (StoreSlice, etc).
	MaxCellDataBytes = 127
	// MaxCellChainBytes is the maximum total bytes in a cell chain (MaxCellChainDepth * MaxCellDataBytes = ~65KB).
	// Represents the practical limit for c4/c5 register data.
	MaxCellChainBytes = MaxCellChainDepth * MaxCellDataBytes // 65,024 bytes
)

// Common error codes constants
const (
	ErrorUnknownDestChainSelector ExitCode = iota + 256
	ErrorDestChainNotEnabled
	ErrorFeeTokenNotSupported
	ErrorStaleGasPrice
	ErrorInvalidMsgData
	ErrorSenderNotAllowed
	ErrorInvalidMessageDestChainSelector
	ErrorSourceChainSelectorMismatch
	ErrorTokenNotSupported
	ErrorUnauthorized
	ErrorSourceChainNotEnabled
	ErrorEmptyReport
	ErrorDispatchNotFromMerkleRoot
)

// AddressWrap is a simple wrapper around address.Address for TLB serialization. Needed for common.SnakedCell[] of addresses.
type AddressWrap struct {
	Val *address.Address `tlb:"addr"`
}

func WrapAddresses(addrs []*address.Address) []AddressWrap {
	wrapped := make([]AddressWrap, len(addrs))
	for i, a := range addrs {
		wrapped[i] = AddressWrap{Val: a}
	}
	return wrapped
}

func (a AddressWrap) BitsLen() uint {
	return 267
}

// TypeAndVersion holds the type and version of the onramp contract.
type TypeAndVersion struct {
	Type    string `tlb:"str"`
	Version string `tlb:"str"`
}

// Deprecated: Use GetTypeAndVersion getter instead.
func (t *TypeAndVersion) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetTypeAndVersion.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*t = res
	return nil
}

// Deprecated: Use GetTypeAndVersion getter instead.
func (t *TypeAndVersion) GetterMethodName() string {
	return versionGetter
}

// Signature is a type that represents a cryptographic signature used in MerkleProofs
type Signature struct {
	Sig []byte `tlb:"bits 256"`
}

// CrossChainAddress is a type that represents a cross-chain address.
type CrossChainAddress []byte

// ToCell converts the CrossChainAddress to a cell structure.
func (c CrossChainAddress) ToCell() (*cell.Cell, error) {
	addrLength := len(c)
	// max length is 64 bytes, plus 1 byte for the length prefix
	if addrLength > CrossChainAddressMaxLength {
		return nil, fmt.Errorf("crosschain address length %d exceeds maximum of %d bytes", len(c), CrossChainAddressMaxLength)
	}

	builder := cell.BeginCell()
	err := builder.StoreSlice([]byte{uint8(addrLength)}, 8) // store the first byte as length
	if err != nil {
		return nil, err
	}

	if err := builder.StoreSlice(c, uint(len(c))*8); err != nil {
		return nil, fmt.Errorf("failed to store cross-chain address: %w", err)
	}
	return builder.EndCell(), nil
}

func (c *CrossChainAddress) LoadFromCell(s *cell.Slice) error {
	if s.BitsLeft() < 8 {
		return errors.New("crosschain address is too short")
	}

	length, err := s.LoadSlice(8)
	if err != nil {
		return fmt.Errorf("failed to load cross-chain address length: %w", err)
	}

	addrLength := int(length[0]) // first byte is the length
	if addrLength == 0 || addrLength > CrossChainAddressMaxLength {
		return fmt.Errorf("invalid crosschain address length %d", addrLength)
	}

	// Check if the remaining bits are enough for the address
	// Safe to convert: addrLength is validated to be in range [1, 64]
	addrLengthUint := uint(addrLength) // #nosec G115
	if s.BitsLeft() < addrLengthUint*8 {
		return errors.New("crosschain address is too short")
	}

	addr, err := s.LoadSlice(addrLengthUint * 8)
	if err != nil {
		return fmt.Errorf("failed to load cross-chain address: %w", err)
	}

	*c = addr
	return nil
}

// LoadCrossChainAddressWithoutPrefix parses a CrossChainAddress from raw data if lacks a length prefix as the first byte.
func LoadCrossChainAddressWithoutPrefix(s *cell.Slice) (CrossChainAddress, error) {
	bitsLeft := s.BitsLeft()

	// Check that the byte length falls within the protocol-defined 1-64 byte range
	byteLength := bitsLeft / 8
	if byteLength == 0 {
		return nil, errors.New("crosschain address is empty")
	}
	if byteLength > CrossChainAddressMaxLength {
		return nil, fmt.Errorf("crosschain address length %d exceeds maximum of %d bytes", byteLength, CrossChainAddressMaxLength)
	}

	data, err := s.LoadSlice(bitsLeft)
	if err != nil {
		return nil, fmt.Errorf("failed to load data for cross chain address: %w", err)
	}
	return data, nil
}

// PackArrayWithRefChaining packs a slice of any serializable type T into a linked cell structure,
// storing each element as a cell reference. When only one reference slot is left, it starts a new cell
// and uses the last reference for chaining.
func packArrayWithRefChaining[T any](array []T) (*cell.Cell, error) {
	if len(array) > MaxArrayLength {
		return nil, fmt.Errorf("array length %d exceeds maximum of %d", len(array), MaxArrayLength)
	}
	builder := cell.BeginCell()
	cells := []*cell.Builder{builder}

	for i, v := range array {
		c, err := tlb.ToCell(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize element %d: %w", i, err)
		}

		// If only one ref left, start a new cell for chaining
		if builder.RefsLeft() == 1 {
			builder = cell.BeginCell()
			cells = append(cells, builder)
		}
		if err := builder.StoreRef(c); err != nil {
			return nil, fmt.Errorf("failed to store element %d: %w", i, err)
		}
	}

	// Link cells in reverse order
	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to store ref at cell %d: %w", i, err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// unpackArrayWithRefChaining unpacks a linked cell structure created by packArrayWithRefChaining
// into a slice of type T. Each element is stored as a cell reference. If a cell has 4 references,
// the last reference is used for chaining to the next cell and is not decoded as an element.
// Validates against TVM limits to document assumptions and prevent potential issues
// if this code is extended to handle untrusted data sources.
func unpackArrayWithRefChaining[T any](root *cell.Cell) ([]T, error) {
	var result []T
	curr := root
	cellCount := 0

	for curr != nil {
		// Validate cell chain depth against TVM maximum
		cellCount++
		if cellCount > MaxCellChainDepth {
			return nil, fmt.Errorf("cell chain depth %d exceeds maximum of %d cells", cellCount, MaxCellChainDepth)
		}

		length := curr.RefsNum()

		// defensive sanity check for length, in real scenarios this should never happen since cell refs are limited to 4
		if length > uint(math.MaxInt) {
			return result, fmt.Errorf("length %d overflows int", length)
		}

		for i := 0; i < int(length); i++ {
			ref, err := curr.PeekRef(i)
			if err != nil {
				return nil, fmt.Errorf("failed to unpack array, at ref index %d: %w", i, err)
			}
			if length == 4 && i == 3 { // chaining happens only when there are 4 refs, at index 3
				curr = ref
				break // move to next cell, do not decode this ref
			}
			var v T
			if err := tlb.LoadFromCell(&v, ref.BeginParse()); err != nil {
				return nil, fmt.Errorf("failed to decode element: %w", err)
			}
			result = append(result, v)

			// Validate total array length doesn't exceed maximum
			if len(result) > MaxArrayLength {
				return nil, fmt.Errorf("array length %d exceeds maximum of %d", len(result), MaxArrayLength)
			}
		}
		if length < 4 {
			break
		}
	}
	return result, nil
}

// packArrayToCell packs a slice of any serializable type T into a snake cell structure.
// Each element is serialized via tlb.ToCell, storing its bits and refs into the current cell.
// When an element doesn't fit (bits exhausted or only 1 ref left), a new cell is started.
// The last ref in each cell is reserved for chaining to the next cell.
//
// Example for []T where each T has 555 bits + 2 refs:
//
//	Cell 0 (root)
//	├── bits: [elem0: 555 bits]
//	├── ref[0]: elem0.field1 (^)
//	├── ref[1]: elem0.field2 (^)
//	└── ref[2]: → Cell 1 (chain)
//	                ├── bits: [elem1: 555 bits]
//	                ├── ref[0]: elem1.field1 (^)
//	                ├── ref[1]: elem1.field2 (^)
//	                └── ref[2]: → Cell 2 (chain)
//	                                └── ... (no chain ref on last cell)
//
// Note: T cannot be primitive types unsupported by tlb.ToCell (e.g., uint64, bool);
// use wrapper types like ChainSelector in router binding.
func packArrayToCell[T any](array []T) (*cell.Cell, error) {
	if len(array) > MaxArrayLength {
		return nil, fmt.Errorf("array length %d exceeds maximum of %d", len(array), MaxArrayLength)
	}
	var cells []*cell.Builder
	builder := cell.BeginCell()

	for i, v := range array {
		c, err := tlb.ToCell(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize element %d: %w", i, err)
		}
		// Each element can have at most 3 refs; 1 ref must be reserved for chaining to next cell.
		if c.RefsNum() > 3 {
			return nil, errors.New("SnakedCell supports elements with at most 3 references (one ref is reserved for chaining cells); for values requiring more references, use a reference-snake encoding such as SnakeRef or a custom layout")
		}
		// Reject ref-only elements (no data bits) - unpacking loop requires bits to iterate.
		if c.BitsSize() == 0 && c.RefsNum() > 0 {
			return nil, errors.New("SnakedCell supports only elements that contain data bits; to encode ref-only values, use a reference-snake encoding such as SnakeRef or redesign the element type")
		}
		// Start new cell if: not enough bits, OR not enough refs for element + 1 chain ref
		if c.BitsSize() > builder.BitsLeft() || c.RefsNum()+1 > builder.RefsLeft() {
			cells = append(cells, builder)
			builder = cell.BeginCell()
		}
		if err := builder.StoreBuilder(c.ToBuilder()); err != nil {
			return nil, fmt.Errorf("failed to store element %d: %w", i, err)
		}
	}
	cells = append(cells, builder)

	// Link cells in reverse order
	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to store ref at cell %d: %w", i, err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// loadChainRef returns the next cell in a snake chain, or nil if no more cells.
// Returns error if more than 1 ref remains (malformed chain).
func loadChainRef(s *cell.Slice) (*cell.Cell, error) {
	refsNum := s.RefsNum()
	if refsNum > 1 {
		return nil, fmt.Errorf("invalid snake chain: expected at most 1 ref, got %d", refsNum)
	}
	if refsNum == 1 {
		return s.LoadRefCell()
	}
	return nil, nil
}

// unpackArrayFromCell unpacks a snake cell structure into a slice of type T.
// For each cell, it reads elements via tlb.LoadFromCell until bits are exhausted,
// then follows the remaining chain ref to the next cell.
//
// Critical: tlb.LoadFromCell consumes both bits AND refs from the slice for elements
// with ^ fields. After loading all elements, only the chain ref (if any) should remain.
// This matches on-chain validation: assert(refs == 1) when following the chain.
//
// Example unpacking flow:
//
//	Cell 0: slice has 555 bits, 3 refs
//	        → tlb.LoadFromCell consumes 555 bits + 2 refs (elem0's ^ fields)
//	        → slice now has 0 bits, 1 ref (chain ref only)
//	        → follow chain ref to Cell 1
//	Cell 1: repeat until no chain ref remains
func unpackArrayFromCell[T any](root *cell.Cell) ([]T, error) {
	var result []T
	curr := root
	cellCount := 0

	for curr != nil {
		// Validate cell chain depth against TVM maximum
		cellCount++
		if cellCount > MaxCellChainDepth {
			return nil, fmt.Errorf("cell chain depth %d exceeds maximum of %d cells", cellCount, MaxCellChainDepth)
		}

		s := curr.BeginParse()
		for s.BitsLeft() > 0 {
			var v T
			if err := tlb.LoadFromCell(&v, s); err != nil {
				return nil, fmt.Errorf("failed to decode element: %w", err)
			}
			result = append(result, v)

			// Validate total array length doesn't exceed maximum
			if len(result) > MaxArrayLength {
				return nil, fmt.Errorf("array length %d exceeds maximum of %d", len(result), MaxArrayLength)
			}
		}
		// Use slice's remaining refs (after element refs are consumed), not cell's original refs.
		// This correctly handles elements with ^ fields whose refs were consumed by tlb.LoadFromCell.
		var err error
		curr, err = loadChainRef(s)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

// packByteArrayToCell packs a byte array into a linked cell structure, supporting empty arrays.
func packByteArrayToCell(data []byte) (*cell.Cell, error) {
	if len(data) == 0 {
		// Return an empty cell instead of nil for empty arrays
		return tvm.EmptyCell, nil
	}

	if len(data) > MaxCellChainBytes {
		return nil, fmt.Errorf("data length %d exceeds maximum of %d bytes", len(data), MaxCellChainBytes)
	}

	cells := []*cell.Builder{cell.BeginCell()}
	curr := cells[0]

	for offset := 0; offset < len(data); {
		bytesFit := curr.BitsLeft() / 8
		remainingBytes := len(data) - offset

		// sanity check for bytesFit before int conversion
		if bytesFit > uint(math.MaxInt) {
			return nil, fmt.Errorf("bytesFit %d overflows int", bytesFit)
		}

		// current cell is smaller than remaining data, write as much as fits in the current cell
		writeLen := min(int(bytesFit), remainingBytes)

		// sanity check for writeLen before int conversion
		if writeLen < 0 {
			return nil, fmt.Errorf("writeLen is negative: %d", writeLen)
		}

		if bytesFit > 0 {
			if err := curr.StoreSlice(data[offset:offset+writeLen], uint(writeLen)*8); err != nil {
				return nil, fmt.Errorf("failed to store bytes: %w", err)
			}
			offset += writeLen
		} else {
			curr = cell.BeginCell()
			cells = append(cells, curr)
		}
	}

	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to link cell: %w", err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// unloadCellToByteArray unpacks a linked cell structure into a byte array, supporting empty arrays.
// Validates chain depth and total byte limits during unpacking. While individual cell data limits
// (127 bytes) are enforced by Builder during creation, chain depth limits (512 for c4/c5) are only
// enforced during TVM execution. This validation ensures data compatibility with TON blockchain
// execution constraints before use in contract state or output actions.
func unloadCellToByteArray(c *cell.Cell) ([]byte, error) {
	if c == nil {
		return []byte{}, nil
	}
	result := make([]byte, 0)
	curr := c
	cellCount := 0
	totalBytes := 0

	for curr != nil {
		// Validate cell chain depth against TVM maximum
		cellCount++
		if cellCount > MaxCellChainDepth {
			return nil, fmt.Errorf("cell chain depth %d exceeds maximum of %d cells", cellCount, MaxCellChainDepth)
		}

		s := curr.BeginParse()
		for s.BitsLeft() > 0 {
			part, err := s.LoadSlice(s.BitsLeft())
			if err != nil {
				return nil, fmt.Errorf("failed to load bytes: %w", err)
			}

			// Validate total byte size against TVM maximum
			totalBytes += len(part)
			if totalBytes > MaxCellChainBytes {
				return nil, fmt.Errorf("total bytes %d exceeds maximum of %d bytes", totalBytes, MaxCellChainBytes)
			}

			result = append(result, part...)
		}

		var err error
		curr, err = loadChainRef(s)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

// ----------- Below is wrapper types that implement the ToCell and LoadFromCell methods for packing and unpacking into cell structures. -----------

// SnakedCell is a generic type for packing and unpacking slices of any type T into a cell structure.
type SnakedCell[T any] []T

// ToCell packs the SnakedCell into a cell. It uses PackArray to serialize the data.
// currently this function is not using pointer receiver, lack of support from tonutils-go library https://github.com/xssnick/tonutils-go/issues/340
func (s SnakedCell[T]) ToCell() (*cell.Cell, error) {
	return packArrayToCell(s)
}

// LoadFromCell loads the SnakedCell from a cell slice. It uses UnpackArray to deserialize the data.
func (s *SnakedCell[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := unpackArrayFromCell[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

// SnakeBytes is a byte array type for packing and unpacking into a cell structure.
type SnakeBytes []byte

// ToCell packs the SnakeBytes into a cell. It uses packByteArrayToCell to serialize the data.
func (s SnakeBytes) ToCell() (*cell.Cell, error) {
	return packByteArrayToCell(s)
}

// LoadFromCell loads the SnakeBytes from a cell slice. It uses unloadCellToByteArray to deserialize the data.
func (s *SnakeBytes) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	data, err := unloadCellToByteArray(cl)
	if err != nil {
		return fmt.Errorf("failed to unpack byte array: %w", err)
	}
	*s = data
	return nil
}

// SnakeRef is a generic type for packing and unpacking slices of any type T into a cell structure with references chaining.
type SnakeRef[T any] []T

// ToCell packs the SnakeRef into a cell. It uses packArrayWithRefChaining to serialize the data.
func (s SnakeRef[T]) ToCell() (*cell.Cell, error) {
	return packArrayWithRefChaining(s)
}

// LoadFromCell loads the SnakeRef from a cell slice. It uses unpackArrayWithRefChaining to deserialize the data.
func (s *SnakeRef[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := unpackArrayWithRefChaining[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

// NewDummyCell returns a cell containing the string "placeholder" in its data.
func NewDummyCell() (*cell.Cell, error) {
	builder := cell.BeginCell()
	payload := []byte("place holder")
	if err := builder.StoreSlice(payload, uint(len(payload)*8)); err != nil { //nolint:gosec // G115: payload is a small constant, no overflow possible
		return nil, err
	}
	return builder.EndCell(), nil
}

// Proof represents a 32-byte (256 bits) proof used in merkle proofs.
// This wrapper type allows [32]byte to be used with SnakedCell by implementing
// ToCell/LoadFromCell that directly store/load 256 bits inline, avoiding the
// infinite loop issue that occurs with SnakeBytes (which uses c.ToCell() in LoadFromCell).
type Proof struct {
	Value *big.Int `tlb:"## 256"` // The value of the struct
}
