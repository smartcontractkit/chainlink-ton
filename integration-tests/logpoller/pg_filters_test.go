package logpoller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/postgres"
)

func TestSQLFilterStore(t *testing.T) {
	ctx := t.Context()
	ds := pgtest.SetupTestDB(t)

	// Create tables
	err := pgtest.ExecuteSQL(ctx, ds, testdata.CreateLogPollerTables)
	require.NoError(t, err)

	// Create store
	orm := postgres.NewORM("test-chain", ds, logger.Test(t))
	filterStore := postgres.NewFilterStore("test-chain", orm, logger.Test(t))

	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	filter := models.Filter{
		Name:          "test-filter",
		Address:       testAddr,
		MsgType:       tlb.MsgTypeInternal,
		EventSig:      counter.TopicCountIncreased,
		StartingSeqNo: 100,
	}

	t.Run("RegisterFilter", func(t *testing.T) {
		filterID, err := filterStore.RegisterFilter(ctx, filter)
		require.NoError(t, err)
		require.Positive(t, filterID)
	})

	t.Run("HasFilter", func(t *testing.T) {
		exists, err := filterStore.HasFilter(ctx, "test-filter")
		require.NoError(t, err)
		assert.True(t, exists)

		exists, err = filterStore.HasFilter(ctx, "non-existent")
		require.NoError(t, err)
		assert.False(t, exists)
	})

	t.Run("GetFiltersByAddress", func(t *testing.T) {
		filters, err := filterStore.GetFiltersByAddress(ctx, testAddr)
		require.NoError(t, err)
		require.Len(t, filters, 1)

		assert.Equal(t, filter.Name, filters[0].Name)
		assert.Equal(t, filter.Address.String(), filters[0].Address.String())
		assert.Equal(t, filter.EventSig, filters[0].EventSig)
	})

	t.Run("UnregisterFilter", func(t *testing.T) {
		err := filterStore.UnregisterFilter(ctx, "test-filter")
		require.NoError(t, err)

		// Verify it's gone
		exists, err := filterStore.HasFilter(ctx, "test-filter")
		require.NoError(t, err)
		assert.False(t, exists)
	})
}
