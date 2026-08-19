package tlbe

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	src "github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// TolkMaxArrayLength is the maximum number of elements a Tolk `array<T>` can
// hold (TVM tuples store up to 255 elements), so an 8-bit length prefix is
// always sufficient.
const TolkMaxArrayLength = 255

// Array is a dedicated marshaller for the Tolk compiler's `array<T>`
// encoding. Unlike `SnakedCell` (a plain ^-ref snake chain), a Tolk `array<T>`
// is stored inline as: `## 8` length prefix followed by a `storeMaybeRef` to the
// head of a chain of cells. Each chain cell starts with a 1-bit continuation
// `maybeRef` (to the next cell) followed by one-or-more packed elements. This
// mirrors the generated TS `storeArrayOf`/`loadArrayOf` layout produced from the
// same Tolk source.
//
// Elements are decoded via the shared tlbe codec so both scalars and structs
// (including ones carrying ^ refs) are supported.
type Array[T any] []T

// ToCell builds the Tolk `array<T>` encoding: an inline `## 8` length prefix and
// a `storeMaybeRef` to the head of a chain of chunks. Each chunk cell begins with
// a 1-bit continuation maybe-ref (to the next chunk) followed by the element. We
// store one element per chunk (like the generated TS `storeArrayOf`), which the
// on-chain parser accepts regardless of how the compiler would have packed them.
func (a Array[T]) ToCell() (*cell.Cell, error) {
	// Tolk arrays are backed by TVM tuples, which hold at most 255 elements.
	if len(a) > TolkMaxArrayLength {
		return nil, fmt.Errorf("tolk array length %d exceeds maximum of %d", len(a), TolkMaxArrayLength)
	}

	// Build the chunk chain in reverse (head ends up referencing subsequent chunks).
	var tail *cell.Cell
	for i := len(a) - 1; i >= 0; i-- {
		elemCell, err := src.ToCell(a[i])
		if err != nil {
			return nil, fmt.Errorf("failed to serialize array element %d: %w", i, err)
		}
		b := cell.BeginCell()
		if err := b.StoreMaybeRef(tail); err != nil {
			return nil, fmt.Errorf("failed to store array chain ref: %w", err)
		}
		if err := b.StoreBuilder(elemCell.ToBuilder()); err != nil {
			return nil, fmt.Errorf("failed to store array element %d: %w", i, err)
		}
		tail = b.EndCell()
	}

	out := cell.BeginCell()
	if err := out.StoreUInt(uint64(len(a)), 8); err != nil {
		return nil, fmt.Errorf("failed to store array length: %w", err)
	}
	if err := out.StoreMaybeRef(tail); err != nil {
		return nil, fmt.Errorf("failed to store array head ref: %w", err)
	}
	return out.EndCell(), nil
}

// LoadFromCell decodes a Tolk `array<T>` from an inline slice. It reads the 8-bit
// length, follows the maybe-ref chunk chain, records every element found, and
// validates the decoded count against the length prefix (matching the generated
// TS `loadArrayOf`, which rejects a mismatch).
func (a *Array[T]) LoadFromCell(loader *cell.Slice) error {
	if a == nil {
		return fmt.Errorf("invalid nil Array receiver")
	}

	length, err := loader.LoadUInt(8)
	if err != nil {
		return fmt.Errorf("failed to load Array length: %w", err)
	}

	// Reset so the receiver is reusable across loads.
	*a = (*a)[:0]

	head, err := loader.LoadMaybeRef()
	if err != nil {
		return fmt.Errorf("failed to load Array head ref: %w", err)
	}
	for head != nil {
		next, err := head.LoadMaybeRef()
		if err != nil {
			return fmt.Errorf("failed to load Array chain flag: %w", err)
		}

		// Load every element packed into this chunk (after the continuation flag).
		for head.RefsNum() > 0 || head.BitsLeft() > 0 {
			var elem T
			if err := src.LoadFromCell(&elem, head); err != nil {
				return fmt.Errorf("failed to load Array element: %w", err)
			}
			*a = append(*a, elem)
		}

		head = next
	}

	if int(length) != len(*a) {
		return fmt.Errorf("mismatch tolk array binary data: expected %d elements, got %d", length, len(*a))
	}
	return nil
}
