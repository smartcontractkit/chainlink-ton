package orm

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestORM_FilterOperations(t *testing.T) {
	chainID := "test-chain"
	orm, cleanup := setupTestDB(t, chainID)
	defer cleanup()

	ctx := context.Background()

	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	dbFilter := &DbFilter{
		Name:          "test-filter",
		Address:       addr.String(),
		MsgType:       string(tlb.MsgTypeInternal),
		EventSig:      123,
		StartingSeqNo: 456,
	}

	t.Run("CreateFilter_ReturnsID", func(t *testing.T) {
		id, err := orm.CreateFilter(ctx, dbFilter)
		require.NoError(t, err)
		require.Positive(t, id)
		dbFilter.ID = id // Set the ID for subsequent tests
	})

	t.Run("FilterExistsByName_Exists", func(t *testing.T) {
		exists, err := orm.FilterExistsByName(ctx, "test-filter")
		require.NoError(t, err)
		require.True(t, exists)
	})

	t.Run("FilterExistsByName_NotExists", func(t *testing.T) {
		exists, err := orm.FilterExistsByName(ctx, "non-existent-filter")
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Run("GetDistinctFilterAddresses", func(t *testing.T) {
		addresses, err := orm.GetDistinctFilterAddresses(ctx)
		require.NoError(t, err)
		require.Len(t, addresses, 1)
		require.Equal(t, addr.String(), addresses[0])
	})

	t.Run("GetFiltersByAddressAndMsgType", func(t *testing.T) {
		filters, err := orm.GetFiltersByAddressAndMsgType(ctx, addr.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filters, 1)
		require.Equal(t, "test-filter", filters[0].Name)
		require.Equal(t, addr.String(), filters[0].Address)
		require.Equal(t, string(tlb.MsgTypeInternal), filters[0].MsgType)
		require.Equal(t, uint32(123), filters[0].EventSig)
	})

	t.Run("GetFiltersByAddressAndMsgType_NoMatches", func(t *testing.T) {
		filters, err := orm.GetFiltersByAddressAndMsgType(ctx, addr.String(), string(tlb.MsgTypeExternalOut))
		require.NoError(t, err)
		require.Empty(t, filters)
	})

	t.Run("DeleteFilterByName", func(t *testing.T) {
		err := orm.DeleteFilterByName(ctx, "test-filter")
		require.NoError(t, err)

		// Verify filter is gone
		exists, err := orm.FilterExistsByName(ctx, "test-filter")
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Run("DeleteFilterByName_NonExistent", func(t *testing.T) {
		// Should not error when removing non-existent filter
		err := orm.DeleteFilterByName(ctx, "non-existent-filter")
		require.NoError(t, err)
	})
}

func TestORM_MultipleFilters(t *testing.T) {
	chainID := "test-chain"
	orm, cleanup := setupTestDB(t, chainID)
	defer cleanup()

	ctx := context.Background()

	// Test addresses
	addr1, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)
	addr2, err := address.ParseAddr("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")
	require.NoError(t, err)

	// Register multiple filters using low-level DbFilter type
	dbFilters := []*DbFilter{
		{
			Name:          "filter1",
			Address:       addr1.String(),
			MsgType:       string(tlb.MsgTypeInternal),
			EventSig:      123,
			StartingSeqNo: 100,
		},
		{
			Name:          "filter2",
			Address:       addr1.String(),
			MsgType:       string(tlb.MsgTypeExternalOut),
			EventSig:      456,
			StartingSeqNo: 200,
		},
		{
			Name:          "filter3",
			Address:       addr2.String(),
			MsgType:       string(tlb.MsgTypeInternal),
			EventSig:      789,
			StartingSeqNo: 300,
		},
	}

	for _, dbFilter := range dbFilters {
		_, err := orm.CreateFilter(ctx, dbFilter)
		require.NoError(t, err)
	}

	t.Run("GetDistinctFilterAddresses_Multiple", func(t *testing.T) {
		addresses, err := orm.GetDistinctFilterAddresses(ctx)
		require.NoError(t, err)
		require.Len(t, addresses, 2)

		// Check both addresses are present
		require.Contains(t, addresses, addr1.String())
		require.Contains(t, addresses, addr2.String())
	})

	t.Run("GetFiltersByAddressAndMsgType_Specific", func(t *testing.T) {
		// Get filters for addr1 with MsgTypeInternal
		filtersResult, err := orm.GetFiltersByAddressAndMsgType(ctx, addr1.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter1", filtersResult[0].Name)

		// Get filters for addr1 with MsgTypeExternalOut
		filtersResult, err = orm.GetFiltersByAddressAndMsgType(ctx, addr1.String(), string(tlb.MsgTypeExternalOut))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter2", filtersResult[0].Name)

		// Get filters for addr2 with MsgTypeInternal
		filtersResult, err = orm.GetFiltersByAddressAndMsgType(ctx, addr2.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter3", filtersResult[0].Name)
	})
}
