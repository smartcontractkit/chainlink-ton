package orm

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestORM_FilterOperations(t *testing.T) {
	chainID := "test-chain"
	testORM := SetupTestORM(t, chainID)

	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	dbFilter := &FilterModel{
		Name:          "test-filter",
		Address:       addr.String(),
		MsgType:       string(tlb.MsgTypeInternal),
		EventSig:      123,
		StartingSeqNo: 456,
	}

	t.Run("CreateFilter_ReturnsID", func(t *testing.T) {
		id, err := testORM.CreateFilter(t.Context(), dbFilter)
		require.NoError(t, err)
		require.Positive(t, id)
		dbFilter.ID = id // Set the ID for subsequent tests
	})

	t.Run("FilterExistsByName_Exists", func(t *testing.T) {
		exists, err := testORM.FilterExistsByName(t.Context(), "test-filter")
		require.NoError(t, err)
		require.True(t, exists)
	})

	t.Run("FilterExistsByName_NotExists", func(t *testing.T) {
		exists, err := testORM.FilterExistsByName(t.Context(), "non-existent-filter")
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Run("GetDistinctFilterAddresses", func(t *testing.T) {
		addresses, err := testORM.GetDistinctFilterAddresses(t.Context())
		require.NoError(t, err)
		require.Len(t, addresses, 1)
		require.Equal(t, addr.String(), addresses[0])
	})

	t.Run("GetFiltersByAddressAndMsgType", func(t *testing.T) {
		filters, err := testORM.GetFiltersByAddressAndMsgType(t.Context(), addr.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filters, 1)
		require.Equal(t, "test-filter", filters[0].Name)
		require.Equal(t, addr.String(), filters[0].Address)
		require.Equal(t, string(tlb.MsgTypeInternal), filters[0].MsgType)
		require.Equal(t, uint32(123), filters[0].EventSig)
	})

	t.Run("GetFiltersByAddressAndMsgType_NoMatches", func(t *testing.T) {
		filters, err := testORM.GetFiltersByAddressAndMsgType(t.Context(), addr.String(), string(tlb.MsgTypeExternalOut))
		require.NoError(t, err)
		require.Empty(t, filters)
	})

	t.Run("DeleteFilterByName", func(t *testing.T) {
		err := testORM.DeleteFilterByName(t.Context(), "test-filter")
		require.NoError(t, err)

		// Verify filter is gone
		exists, err := testORM.FilterExistsByName(t.Context(), "test-filter")
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Run("DeleteFilterByName_NonExistent", func(t *testing.T) {
		// Should not error when removing non-existent filter
		err := testORM.DeleteFilterByName(t.Context(), "non-existent-filter")
		require.NoError(t, err)
	})
}

func TestORM_MultipleFilters(t *testing.T) {
	chainID := "test-chain"
	testORM := SetupTestORM(t, chainID)

	// Test addresses
	addr1, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)
	addr2, err := address.ParseAddr("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")
	require.NoError(t, err)

	// Register multiple filters using low-level FilterModel type
	dbFilters := []*FilterModel{
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
		_, err := testORM.CreateFilter(t.Context(), dbFilter)
		require.NoError(t, err)
	}

	t.Run("GetDistinctFilterAddresses_Multiple", func(t *testing.T) {
		addresses, err := testORM.GetDistinctFilterAddresses(t.Context())
		require.NoError(t, err)
		require.Len(t, addresses, 2)

		// Check both addresses are present
		require.Contains(t, addresses, addr1.String())
		require.Contains(t, addresses, addr2.String())
	})

	t.Run("GetFiltersByAddressAndMsgType_Specific", func(t *testing.T) {
		// Get filters for addr1 with MsgTypeInternal
		filtersResult, err := testORM.GetFiltersByAddressAndMsgType(t.Context(), addr1.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter1", filtersResult[0].Name)

		// Get filters for addr1 with MsgTypeExternalOut
		filtersResult, err = testORM.GetFiltersByAddressAndMsgType(t.Context(), addr1.String(), string(tlb.MsgTypeExternalOut))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter2", filtersResult[0].Name)

		// Get filters for addr2 with MsgTypeInternal
		filtersResult, err = testORM.GetFiltersByAddressAndMsgType(t.Context(), addr2.String(), string(tlb.MsgTypeInternal))
		require.NoError(t, err)
		require.Len(t, filtersResult, 1)
		require.Equal(t, "filter3", filtersResult[0].Name)
	})
}
