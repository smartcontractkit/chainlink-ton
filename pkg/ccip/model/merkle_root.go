package model

import (
	"fmt"
	"math"
	"math/big"
	"time"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/merkleroot"
)

// ---------- MerkleRoot Model Struct Definitions ----------

type MerkleRootStorage struct {
	Root                  string           `json:"root"`
	Owner                 *address.Address `json:"owner"`
	Timestamp             time.Time        `json:"timestamp"`
	MinMsgNr              uint64           `json:"minMsgNr"`
	MaxMsgNr              uint64           `json:"maxMsgNr"`
	MessageStates         []ExecutionState `json:"messageStates"`
	DeliveredMessageCount uint16           `json:"deliveredMessageCount"`
}

type ExecutionState int

const (
	Untouched  ExecutionState = iota // 0
	InProgress                       // 1
	Success                          // 2
	Failure                          // 3
)

// ---------- Builder ----------

type MerkleRootStorageBuilder struct {
	storage MerkleRootStorage
	err     error
}

// NewMerkleRootStorageBuilder creates a new builder with zero-value storage
// and initialized maps.
func NewMerkleRootStorageBuilder() *MerkleRootStorageBuilder {
	return &MerkleRootStorageBuilder{
		storage: MerkleRootStorage{},
	}
}

func (b *MerkleRootStorageBuilder) WithRoot(root string) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}

	if len(root) != 64 {
		b.err = fmt.Errorf("invalid merkle root length: expected 64 hex chars, got %d", len(root))
		return b
	}

	b.storage.Root = root
	return b
}

func (b *MerkleRootStorageBuilder) WithOwner(owner *address.Address) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Owner = owner
	return b
}

func (b *MerkleRootStorageBuilder) WithTimestamp(ts time.Time) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Timestamp = ts
	return b
}

func (b *MerkleRootStorageBuilder) WithMinMsgNr(n uint64) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.MinMsgNr = n
	return b
}

func (b *MerkleRootStorageBuilder) WithMaxMsgNr(n uint64) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.MaxMsgNr = n
	return b
}

func (b *MerkleRootStorageBuilder) WithMessageStates(states []ExecutionState) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.MessageStates = states
	return b
}

func (b *MerkleRootStorageBuilder) WithDeliveredMessageCount(count uint16) *MerkleRootStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.DeliveredMessageCount = count
	return b
}

// Build returns the constructed MerkleRootStorage or an error if any step failed.
func (b *MerkleRootStorageBuilder) Build() (*MerkleRootStorage, error) {
	if b.err != nil {
		return nil, b.err
	}
	st := b.storage // copy
	return &st, nil
}

func (s *MerkleRootStorage) FromBinding(raw *merkleroot.Storage) error {
	root, err := bigIntToHex(raw.Root, 32)
	if err != nil {
		return err
	}

	b := NewMerkleRootStorageBuilder().
		WithRoot(root).
		WithOwner(raw.Owner).
		WithMinMsgNr(raw.MinMsgNr).
		WithMaxMsgNr(raw.MaxMsgNr).
		WithDeliveredMessageCount(raw.DeliveredMessageCount)

	// State
	if raw.MaxMsgNr < raw.MinMsgNr {
		return fmt.Errorf("MaxMsgNr (%d) < MinMsgNr (%d)", raw.MaxMsgNr, raw.MinMsgNr)
	}

	numberOfMessages := (raw.MaxMsgNr - raw.MinMsgNr) + 1
	messageStates := make([]ExecutionState, numberOfMessages)

	// Ensure i*2 always fits in a uint before the loop
	if numberOfMessages > uint64(math.MaxUint/2) {
		return fmt.Errorf("numberOfMessages %d too large for shift computation", numberOfMessages)
	}

	for i := range numberOfMessages {
		shiftU64 := i * 2
		shift := uint(shiftU64)

		// mask for the two bits at position shift: 0b11 << shift
		mask := new(big.Int).Lsh(big.NewInt(3), shift)

		// temp = (bitmap & mask) >> shift
		temp := new(big.Int).And(raw.MessageStates, mask)
		temp.Rsh(temp, shift)

		// lint check
		stateU64 := temp.Uint64()
		if stateU64 > uint64(math.MaxInt) {
			return fmt.Errorf("execution state %d overflows int", stateU64)
		}

		messageStates[i] = ExecutionState(stateU64)
	}

	b = b.WithMessageStates(messageStates)

	// Timestamp
	if raw.Timestamp > math.MaxInt64 {
		return fmt.Errorf("timestamp %d overflows int64", raw.Timestamp)
	}

	b = b.WithTimestamp(time.Unix(int64(raw.Timestamp), 0).UTC())

	built, err := b.Build()
	if err != nil {
		return err
	}

	*s = *built
	return nil
}

func (s *MerkleRootStorage) ToBinding() (*merkleroot.Storage, error) {
	root, err := hexToBigInt(s.Root)
	if err != nil {
		return nil, err
	}

	st := merkleroot.Storage{
		Root:                  root,
		Owner:                 s.Owner,
		MinMsgNr:              s.MinMsgNr,
		MaxMsgNr:              s.MaxMsgNr,
		DeliveredMessageCount: s.DeliveredMessageCount,
	}

	// State
	messageStates := big.NewInt(0)

	for i, s := range s.MessageStates {
		// Linter keeps complaining and I needed to add this unnecessary check
		if i < 0 {
			return nil, fmt.Errorf("negative index in MessageStates: %d", i)
		}

		// work in uint64
		shiftU64 := uint64(i) * 2

		// ensure it fits into uint before casting
		if shiftU64 > uint64(math.MaxUint) {
			return nil, fmt.Errorf("shift %d would overflow uint", shiftU64)
		}

		shift := uint(shiftU64)

		// value = int64(state) << shift
		value := new(big.Int).Lsh(big.NewInt(int64(s)), shift)

		// OR it into the bitmap
		messageStates.Or(messageStates, value)
	}
	st.MessageStates = messageStates

	// Timestamp
	timestamp := s.Timestamp.Unix()
	if timestamp < 0 {
		return nil, fmt.Errorf("timestamp in timestamp %d underflows uint64", timestamp)
	}
	st.Timestamp = uint64(timestamp)

	return &st, nil
}
