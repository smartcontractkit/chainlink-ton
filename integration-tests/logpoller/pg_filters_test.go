package logpoller

import (
	"testing"
	"time"

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

	t.Run("RegisterFilter with retention fields", func(t *testing.T) {
		retentionFilter := models.Filter{
			Name:          "retention-filter",
			Address:       testAddr,
			MsgType:       tlb.MsgTypeInternal,
			EventSig:      counter.TopicCountIncreased,
			StartingSeqNo: 100,
			LogRetention:  24 * time.Hour, // 24 hours
			MaxLogsKept:   10000,          // 10k logs
		}

		filterID, err := filterStore.RegisterFilter(ctx, retentionFilter)
		require.NoError(t, err)
		require.Positive(t, filterID)

		// Verify fields persisted correctly
		filters, err := filterStore.GetFiltersByAddress(ctx, testAddr)
		require.NoError(t, err)

		// Find our filter (may have existing test-filter)
		var found *models.Filter
		for i := range filters {
			if filters[i].Name == "retention-filter" {
				found = &filters[i]
				break
			}
		}
		require.NotNil(t, found, "retention-filter not found")
		require.Equal(t, 24*time.Hour, found.LogRetention)
		require.Equal(t, int64(10000), found.MaxLogsKept)
	})

	t.Run("RegisterFilter with zero retention (use default)", func(t *testing.T) {
		defaultFilter := models.Filter{
			Name:          "default-retention-filter",
			Address:       testAddr,
			MsgType:       tlb.MsgTypeInternal,
			EventSig:      counter.TopicCountIncreased,
			StartingSeqNo: 100,
			LogRetention:  0, // 0 = keep forever
			MaxLogsKept:   0, // 0 = unlimited
		}

		filterID, err := filterStore.RegisterFilter(ctx, defaultFilter)
		require.NoError(t, err)
		require.Positive(t, filterID)

		// Verify zero values stored correctly
		filters, err := filterStore.GetFiltersByAddress(ctx, testAddr)
		require.NoError(t, err)

		var found *models.Filter
		for i := range filters {
			if filters[i].Name == "default-retention-filter" {
				found = &filters[i]
				break
			}
		}
		require.NotNil(t, found, "default-retention-filter not found")
		require.Equal(t, time.Duration(0), found.LogRetention)
		require.Equal(t, int64(0), found.MaxLogsKept)
	})

	t.Run("RegisterFilter rejects negative retention", func(t *testing.T) {
		negativeFilter := models.Filter{
			Name:          "invalid-negative-retention",
			Address:       testAddr,
			MsgType:       tlb.MsgTypeInternal,
			EventSig:      counter.TopicCountIncreased,
			StartingSeqNo: 100,
			LogRetention:  -1 * time.Hour, // Invalid
			MaxLogsKept:   10000,
		}

		_, err := filterStore.RegisterFilter(ctx, negativeFilter)
		require.Error(t, err)
		require.Contains(t, err.Error(), "cannot be negative")
	})

	t.Run("RegisterFilter rejects negative max_logs_kept", func(t *testing.T) {
		negativeFilter := models.Filter{
			Name:          "invalid-negative-maxlogs",
			Address:       testAddr,
			MsgType:       tlb.MsgTypeInternal,
			EventSig:      counter.TopicCountIncreased,
			StartingSeqNo: 100,
			LogRetention:  24 * time.Hour,
			MaxLogsKept:   -1, // Invalid
		}

		_, err := filterStore.RegisterFilter(ctx, negativeFilter)
		require.Error(t, err)
		require.Contains(t, err.Error(), "cannot be negative")
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
