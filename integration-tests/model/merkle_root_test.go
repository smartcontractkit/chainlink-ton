package model

import (
	"testing"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/merkleroot"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"

	"github.com/stretchr/testify/require"
)

func countState(states []model.ExecutionState, target model.ExecutionState) int {
	count := 0
	for _, s := range states {
		if s == target {
			count++
		}
	}
	return count
}

func TestDecodeMerkleRootData(t *testing.T) {
	// GIVEN: a merkle root storage model
	ownerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8e")

	storage, err := model.NewMerkleRootStorageBuilder().
		WithRoot("7f3c9e12a4d8b0f16c27e5aa91f4cb8d3e0fa7c6b28d54ef1c93b72a0de4589f").
		WithOwner(ownerAddress).
		WithMinMsgNr(10).
		WithMaxMsgNr(19).
		WithDeliveredMessageCount(3).
		WithMessageStates([]model.ExecutionState{
			model.Untouched, model.Failure, model.InProgress, model.Success, model.Success, model.Untouched, model.Untouched, model.Untouched, model.Untouched, model.Untouched,
		}).
		WithTimestamp(mustTimestamp("2025-11-18T17:59:46Z")).
		Build()
	require.NoError(t, err)

	t.Run("TestModel", func(t *testing.T) {
		t.Parallel()

		require.Equal(t, "7f3c9e12a4d8b0f16c27e5aa91f4cb8d3e0fa7c6b28d54ef1c93b72a0de4589f", storage.Root)
		require.Equal(t, ownerAddress, storage.Owner)
		require.Equal(t, uint64(10), storage.MinMsgNr)
		require.Equal(t, uint64(19), storage.MaxMsgNr)
		require.Equal(t, uint16(3), storage.DeliveredMessageCount)
		require.Len(t, storage.MessageStates, 10)
		require.Equal(t, countState(storage.MessageStates, model.Untouched), 6)
		require.Equal(t, countState(storage.MessageStates, model.InProgress), 1)
		require.Equal(t, countState(storage.MessageStates, model.Success), 2)
		require.Equal(t, countState(storage.MessageStates, model.Failure), 1)
		require.Equal(t, mustTimestamp("2025-11-18T17:59:46Z"), storage.Timestamp)
	})

	t.Run("TestMapper", func(t *testing.T) {
		t.Parallel()

		hexData := "b5ee9c7241010101006e0000d77f3c9e12a4d8b0f16c27e5aa91f4cb8d3e0fa7c6b28d54ef1c93b72a0de4589f800000000000000000000000000000000000000000000000000000000000000000400000000d23968240000000000000014000000000000002600000000000000000000000000000538000700de1c6ea"

		AssertHexMappingRoundTrip[merkleroot.Storage](
			t,
			hexData,
			storage, // original
			func() model.Mapper[merkleroot.Storage] {
				// empty instance to decode into
				return &model.MerkleRootStorage{}
			},
		)
	})
}
