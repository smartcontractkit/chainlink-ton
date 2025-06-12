package bindings

import (
	"bytes"
	"encoding/json"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

// CommitReportLC represents the top-level structure for a commit report with linked cell encoding/decoding.
type CommitReportLC struct {
	PriceUpdates  PriceUpdatesLC
	MerkleRoot    MerkleRootsLC
	RMNSignatures []Signature
}

type MerkleRootsLC struct {
	BlessedMerkleRoots   []MerkleRoot
	UnblessedMerkleRoots []MerkleRoot
}

// PriceUpdatesLC holds token and gas price updates.
type PriceUpdatesLC struct {
	TokenPriceUpdates []TokenPriceUpdate
	GasPriceUpdates   []GasPriceUpdate
}

func SerializeToLinkedCells[T any](data T) (*cell.Cell, error) {
	b, err := marshalStructToBytes(data)
	if err != nil {
		return nil, err
	}

	var cells []*cell.Builder
	curr := cell.BeginCell()
	cells = append(cells, curr)
	offset := 0

	for offset < len(b) {
		bitsLeft := curr.BitsLeft()
		bytesLeft := int(bitsLeft / 8)
		if bytesLeft == 0 {
			// Start a new cell
			curr = cell.BeginCell()
			cells = append(cells, curr)
			continue
		}
		end := offset + bytesLeft
		if end > len(b) {
			end = len(b)
		}
		if err := curr.StoreSlice(b[offset:end], uint((end-offset)*8)); err != nil {
			return nil, err
		}
		offset = end
	}

	// Link cells in reverse order
	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, err
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

func DeserializeFromLinkedCells[T any](root *cell.Cell) (T, error) {
	var buf bytes.Buffer
	curr := root
	for curr != nil {
		s, err := curr.BeginParse().LoadSlice(curr.BitsSize())
		if err != nil {
			var zero T
			return zero, err
		}
		_, _ = buf.Write(s)
		if curr.RefsNum() > 0 {
			ref, err := curr.PeekRef(0) // Use Ref, not PeekRef
			if err != nil {
				var zero T
				return zero, err
			}
			curr = ref
		} else {
			curr = nil
		}
	}
	return unmarshalBytesToStruct[T](buf.Bytes())
}

// --- Helper marshal/unmarshal functions (implement as needed) ---
func marshalStructToBytes(data any) ([]byte, error) {
	return json.Marshal(data)
}

// unmarshalBytesToStruct deserializes JSON bytes to a struct of type T.
func unmarshalBytesToStruct[T any](b []byte) (T, error) {
	var t T
	if err := json.Unmarshal(b, &t); err != nil {
		return t, err
	}
	return t, nil
}
