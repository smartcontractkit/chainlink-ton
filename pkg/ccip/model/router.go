package model

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// ---------- Router Model Struct Definitions ----------

type RouterStorage struct {
	ID            uint32                      `json:"id"`
	Ownable       Ownable2Step                `json:"ownable"`
	WrappedNative *address.Address            `json:"wrappedNative"`
	OnRamps       map[uint64]*address.Address `json:"onRamps"`
	OffRamps      map[uint64]*address.Address `json:"offRamps"`
	RMNRemote     RMNRemote                   `json:"rmnRemote"`
}

type RMNRemote struct {
	Admin          Ownable2Step       `json:"admin"`
	CursedSubjects []*big.Int         `json:"cursedSubjects"`
	ForwardUpdates []*address.Address `json:"forwardUpdates"`
}

// ---------- Builder ----------

type RouterStorageBuilder struct {
	storage RouterStorage
	err     error
}

// NewRouterStorageBuilder creates a new builder with zero-value storage
// and initialized maps.
func NewRouterStorageBuilder() *RouterStorageBuilder {
	return &RouterStorageBuilder{
		storage: RouterStorage{
			OnRamps:  make(map[uint64]*address.Address),
			OffRamps: make(map[uint64]*address.Address),
		},
	}
}

func (b *RouterStorageBuilder) WithID(id uint32) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.ID = id
	return b
}

func (b *RouterStorageBuilder) WithOwnable(owner, pending *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Ownable = Ownable2Step{
		Owner:        owner,
		PendingOwner: pending,
	}
	return b
}

func (b *RouterStorageBuilder) WithWrapperNative(wrappedNative *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.WrappedNative = wrappedNative
	return b
}

func (b *RouterStorageBuilder) WithOnRamp(chainSelector uint64, onRamp *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.OnRamps[chainSelector] = onRamp
	return b
}

func (b *RouterStorageBuilder) WithOffRamp(chainSelector uint64, offRamp *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.OffRamps[chainSelector] = offRamp
	return b
}

func (b *RouterStorageBuilder) WithRMNRemote(owner, pending *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.RMNRemote.Admin = Ownable2Step{
		Owner:        owner,
		PendingOwner: pending,
	}
	return b
}

func (b *RouterStorageBuilder) WithRMNRemoteForwardUpdates(forwardUpdate *address.Address) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}

	b.storage.RMNRemote.ForwardUpdates = append(b.storage.RMNRemote.ForwardUpdates, forwardUpdate)
	return b
}

func (b *RouterStorageBuilder) WithRMNRemoteCursedSubject(cursedSubject *big.Int) *RouterStorageBuilder {
	if b.err != nil {
		return b
	}

	b.storage.RMNRemote.CursedSubjects = append(b.storage.RMNRemote.CursedSubjects, new(big.Int).Set(cursedSubject))
	return b
}

// Build returns the constructed RouterStorage or an error if any step failed.
func (b *RouterStorageBuilder) Build() (*RouterStorage, error) {
	if b.err != nil {
		return nil, b.err
	}
	// copy to avoid future accidental mutation through the builder
	st := b.storage
	return &st, nil
}

func (s *RouterStorage) FromBinding(raw *router.Storage) error {
	b := NewRouterStorageBuilder().
		WithID(raw.ID).
		WithOwnable(
			raw.Ownable.Owner,
			raw.Ownable.PendingOwner,
		).
		WithWrapperNative(raw.WrappedNative).
		WithRMNRemote(raw.RMNRemote.Admin.Owner, raw.RMNRemote.Admin.PendingOwner)

	// OnRamp
	onRamps, err := raw.OnRamps.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading onRamps: %w", err)
	}
	for _, kv := range onRamps {
		selector, err2 := kv.Key.LoadUInt(64)
		if err2 != nil {
			return fmt.Errorf("error while decoding chain selector from onRamps: %w", err2)
		}

		var onRamp common.AddressWrap
		if err3 := tlb.LoadFromCell(&onRamp, kv.Value); err3 != nil {
			return fmt.Errorf("error while decoding OnRamps value: %w", err3)
		}

		b = b.WithOnRamp(selector, onRamp.Val)
	}

	// OffRamp
	offRamps, err := raw.OffRamps.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading offRamps: %w", err)
	}
	for _, kv := range offRamps {
		selector, err2 := kv.Key.LoadUInt(64)
		if err2 != nil {
			return fmt.Errorf("error while decoding chain selector from offRamps: %w", err2)
		}

		var offRamp common.AddressWrap
		if err3 := tlb.LoadFromCell(&offRamp, kv.Value); err3 != nil {
			return fmt.Errorf("error while decoding offRamps value: %w", err3)
		}

		b = b.WithOffRamp(selector, offRamp.Val)
	}

	// RMNRemote.ForwardUpdates
	forwardUpdates, err := raw.RMNRemote.ForwardUpdates.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading RMNRemote.ForwardUpdates: %w", err)
	}
	for _, fu := range forwardUpdates {
		var forwardUpdate common.AddressWrap
		if err2 := tlb.LoadFromCell(&forwardUpdate, fu.Key); err2 != nil {
			return fmt.Errorf("error while decoding ForwardUpdates value: %w", err2)
		}

		b = b.WithRMNRemoteForwardUpdates(forwardUpdate.Val)
	}

	// RMNRemote.CursedSubjects
	cursedSubjects, err := raw.RMNRemote.CursedSubjects.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading RMNRemote.CursedSubjects: %w", err)
	}
	for _, kv := range cursedSubjects {
		cursedObject, err2 := kv.Key.LoadBigUInt(128)

		if err2 != nil {
			return fmt.Errorf("error while decoding CursedSubjects: %w", err2)
		}

		b = b.WithRMNRemoteCursedSubject(cursedObject)
	}

	built, err := b.Build()
	if err != nil {
		return err
	}

	*s = *built
	return nil
}

func (s *RouterStorage) ToBinding() (*router.Storage, error) {
	st := router.Storage{
		ID: s.ID,
		Ownable: ownable2step.Storage{
			Owner:        s.Ownable.Owner,
			PendingOwner: s.Ownable.PendingOwner,
		},
		WrappedNative: s.WrappedNative,
		RMNRemote: router.RMNRemote{
			Admin: ownable2step.Storage{
				Owner:        s.RMNRemote.Admin.Owner,
				PendingOwner: s.RMNRemote.Admin.PendingOwner,
			},
		},
	}

	// OnRamps
	st.OnRamps = cell.NewDict(64)
	for selector, onramp := range s.OnRamps {
		wrappedOnRamp := common.AddressWrap{
			Val: onramp,
		}

		onRampCell, err := tlb.ToCell(wrappedOnRamp)
		if err != nil {
			return nil, fmt.Errorf("error while encoding wrappedOnRamp as cell: %w", err)
		}

		if err := st.OnRamps.Set(
			cell.BeginCell().MustStoreUInt(selector, 64).EndCell(),
			onRampCell,
		); err != nil {
			return nil, fmt.Errorf("error while encoding OnRamps as cell: %w", err)
		}
	}

	// OffRamps
	st.OffRamps = cell.NewDict(64)
	for selector, offramp := range s.OffRamps {
		wrappedOffRamp := common.AddressWrap{
			Val: offramp,
		}

		offRampCell, err := tlb.ToCell(wrappedOffRamp)
		if err != nil {
			return nil, fmt.Errorf("error while encoding wrappedOffRamp as cell: %w", err)
		}

		if err := st.OffRamps.Set(
			cell.BeginCell().MustStoreUInt(selector, 64).EndCell(),
			offRampCell,
		); err != nil {
			return nil, fmt.Errorf("error while encoding OffRamps as cell: %w", err)
		}
	}

	// RMNRemote.ForwardUpdates
	st.RMNRemote.ForwardUpdates = cell.NewDict(267)
	for _, fu := range s.RMNRemote.ForwardUpdates {
		if err := st.RMNRemote.ForwardUpdates.Set(
			cell.BeginCell().MustStoreAddr(fu).EndCell(),
			tvm.EmptyCell,
		); err != nil {
			return nil, fmt.Errorf("error while setting ForwardUpdates: %w", err)
		}
	}

	// RMNRemote.CursedObjects
	st.RMNRemote.CursedSubjects = cell.NewDict(128)
	for _, co := range s.RMNRemote.CursedSubjects {
		if err := st.RMNRemote.CursedSubjects.Set(
			cell.BeginCell().MustStoreBigUInt(co, 128).EndCell(),
			tvm.EmptyCell,
		); err != nil {
			return nil, fmt.Errorf("error while setting CursedSubjects: %w", err)
		}
	}

	return &st, nil
}
