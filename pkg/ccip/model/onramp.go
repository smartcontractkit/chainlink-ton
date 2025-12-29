package model

import (
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
)

// ---------- OnRamp Model Struct Definitions ----------

type OnRampStorage struct {
	ID      uint32       `json:"id"`
	Ownable Ownable2Step `json:"ownable"`
}

// ---------- Builder ----------

type OnRampStorageBuilder struct {
	storage OnRampStorage
	err     error
}

// NewOnRampStorageBuilder creates a new builder with zero-value storage
// and initialized maps.
func NewOnRampStorageBuilder() *OnRampStorageBuilder {
	return &OnRampStorageBuilder{
		storage: OnRampStorage{},
	}
}

func (b *OnRampStorageBuilder) WithID(id uint32) *OnRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.ID = id
	return b
}

func (b *OnRampStorageBuilder) WithOwnable(owner, pending *address.Address) *OnRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Ownable = Ownable2Step{
		Owner:        owner,
		PendingOwner: pending,
	}
	return b
}

// Build returns the constructed OnRampStorage or an error if any step failed.
func (b *OnRampStorageBuilder) Build() (*OnRampStorage, error) {
	if b.err != nil {
		return nil, b.err
	}
	// copy to avoid future accidental mutation through the builder
	st := b.storage
	return &st, nil
}

func (s *OnRampStorage) FromBinding(raw *onramp.Storage) error {
	b := NewOnRampStorageBuilder().
		WithID(raw.ID).
		WithOwnable(
			raw.Ownable.Owner,
			raw.Ownable.PendingOwner,
		)

	built, err := b.Build()
	if err != nil {
		return err
	}

	*s = *built
	return nil
}

func (s *OnRampStorage) ToBinding() (*onramp.Storage, error) {
	st := onramp.Storage{
		ID: s.ID,
		Ownable: ownable2step.Storage{
			Owner:        s.Ownable.Owner,
			PendingOwner: s.Ownable.PendingOwner,
		},
	}

	return &st, nil
}
