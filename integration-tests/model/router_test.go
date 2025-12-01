package model

import (
	"math/big"
	"testing"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"

	"github.com/stretchr/testify/require"
)

func TestDecodeRouterData(t *testing.T) {
	// GIVEN: a router storage model
	ownerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8e")
	pendingOwnerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ_5")
	tonTokenAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99")
	offRamp1 := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8_")
	offRamp2 := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABI_Y")
	onRamp1 := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ_5")
	onRamp2 := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABq-a")
	var chainSelector1 uint64 = 14767482510784806043
	var chainSelector2 uint64 = 16015286601757825753

	storage, err := model.NewRouterStorageBuilder().
		WithID(1000).
		WithOwnable(
			ownerAddress,
			pendingOwnerAddress,
		).
		WithWrapperNative(tonTokenAddress).
		WithOnRamp(chainSelector1, onRamp1).
		WithOnRamp(chainSelector2, onRamp2).
		WithOffRamp(chainSelector1, offRamp1).
		WithOffRamp(chainSelector2, offRamp2).
		WithRMNRemote(ownerAddress, pendingOwnerAddress).
		WithRMNRemoteForwardUpdates(offRamp1).
		WithRMNRemoteForwardUpdates(offRamp2).
		WithRMNRemoteCursedSubject(new(big.Int).SetUint64(chainSelector1)).
		WithRMNRemoteCursedSubject(new(big.Int).SetUint64(chainSelector2)).
		Build()
	require.NoError(t, err)

	t.Run("TestModel", func(t *testing.T) {
		t.Parallel()

		// ID
		require.Equal(t, uint32(1000), storage.ID)

		// Ownable
		require.Equal(t, ownerAddress, storage.Ownable.Owner)
		require.Equal(t, pendingOwnerAddress, storage.Ownable.PendingOwner)

		// Wrapped Native
		require.Equal(t, tonTokenAddress, storage.WrappedNative)

		// OnRamps
		require.Len(t, storage.OnRamps, 2)

		actualOnRamp1, ok := storage.OnRamps[chainSelector1]
		require.True(t, ok)
		require.Equal(t, onRamp1, actualOnRamp1)

		actualOnRamp2, ok := storage.OnRamps[chainSelector2]
		require.True(t, ok)
		require.Equal(t, onRamp2, actualOnRamp2)

		// OffRamps
		require.Len(t, storage.OffRamps, 2)

		actualOffRamp1, ok := storage.OffRamps[chainSelector1]
		require.True(t, ok)
		require.Equal(t, offRamp1, actualOffRamp1)

		actualOffRamp2, ok := storage.OffRamps[chainSelector2]
		require.True(t, ok)
		require.Equal(t, offRamp2, actualOffRamp2)

		// RMNRemote
		require.Equal(t, ownerAddress, storage.RMNRemote.Admin.Owner)
		require.Equal(t, pendingOwnerAddress, storage.RMNRemote.Admin.PendingOwner)

		require.Len(t, storage.RMNRemote.ForwardUpdates, 2)
		require.Equal(t, storage.RMNRemote.ForwardUpdates[0], offRamp1)
		require.Equal(t, storage.RMNRemote.ForwardUpdates[1], offRamp2)

		require.Len(t, storage.RMNRemote.CursedSubjects, 2)
		require.Equal(t, storage.RMNRemote.CursedSubjects[0].Uint64(), chainSelector1)
		require.Equal(t, storage.RMNRemote.CursedSubjects[1].Uint64(), chainSelector2)
	})

	t.Run("TestMapper", func(t *testing.T) {
		t.Parallel()

		hexData := "b5ee9c7241020e010001c00003d1000003e880000000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000000f00102030202760405020276060702868000000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000001708090053bccf0a31a221f3c9b800000000000000000000000000000000000000000000000000000000000000000b0053bce41ba4fc9d91ad9800000000000000000000000000000000000000000000000000000000000000000d0053bccf0a31a221f3c9b80000000000000000000000000000000000000000000000000000000000000000070053bce41ba4fc9d91ad98000000000000000000000000000000000000000000000000000000000000000009021390c000000000000000340a0b0245a1100000000000000000000000000000000000000000000000000000000000000000100c0d0011bccf0a31a221f3c9b80011bce41ba4fc9d91ad980001f40001d4172ea47a"

		AssertHexMappingRoundTrip[router.Storage](
			t,
			hexData,
			storage, // original
			func() model.Mapper[router.Storage] {
				// empty instance to decode into
				return &model.RouterStorage{}
			},
		)
	})
}
