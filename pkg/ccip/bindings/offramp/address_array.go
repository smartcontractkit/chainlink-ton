package offramp

import (
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// AddressArray is a Tolk `array<address>` stored inline (use with `tlb:"."`).
//
// Tolk encodes `array<T>` as `len: uint8` followed by a `maybe ^` chain of chunks, where each chunk
// is `next: maybe ^chunk` followed by as many packed elements as fit. Encoding uses one element
// per chunk (as the generated TS wrappers do); decoding accepts any chunking.
type AddressArray []*address.Address

// maxTolkArrayLen is the largest length a Tolk array's uint8 length prefix can hold.
const maxTolkArrayLen = 255

// ToCell encodes the array inline: the returned cell's bits and refs are the field itself.
func (a AddressArray) ToCell() (*cell.Cell, error) {
	if len(a) > maxTolkArrayLen {
		return nil, fmt.Errorf("array<address> has %d elements, max %d", len(a), maxTolkArrayLen)
	}
	var tail *cell.Cell
	for i := len(a) - 1; i >= 0; i-- {
		chunk := cell.BeginCell()
		if err := chunk.StoreMaybeRef(tail); err != nil {
			return nil, fmt.Errorf("store chunk link: %w", err)
		}
		if err := chunk.StoreAddr(a[i]); err != nil {
			return nil, fmt.Errorf("store element %d: %w", i, err)
		}
		tail = chunk.EndCell()
	}
	b := cell.BeginCell()
	if err := b.StoreUInt(uint64(len(a)), 8); err != nil {
		return nil, fmt.Errorf("store length: %w", err)
	}
	if err := b.StoreMaybeRef(tail); err != nil {
		return nil, fmt.Errorf("store head: %w", err)
	}
	return b.EndCell(), nil
}

// LoadFromCell decodes the array from the current position of the slice.
func (a *AddressArray) LoadFromCell(loader *cell.Slice) error {
	length, err := loader.LoadUInt(8)
	if err != nil {
		return fmt.Errorf("load length: %w", err)
	}
	head, err := loader.LoadMaybeRef()
	if err != nil {
		return fmt.Errorf("load head: %w", err)
	}
	out := make(AddressArray, 0, length)
	for head != nil {
		next, err := head.LoadMaybeRef()
		if err != nil {
			return fmt.Errorf("load chunk link: %w", err)
		}
		for head.BitsLeft() > 0 || head.RefsNum() > 0 {
			addr, err := head.LoadAddr()
			if err != nil {
				return fmt.Errorf("load element %d: %w", len(out), err)
			}
			out = append(out, addr)
		}
		head = next
	}
	if uint64(len(out)) != length {
		return errors.New("array<address> length prefix does not match its elements")
	}
	*a = out
	return nil
}
