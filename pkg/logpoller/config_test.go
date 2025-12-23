package logpoller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

func TestConfig_ApplyDefaults(t *testing.T) {
	t.Run("applies all defaults to empty config", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()

		require.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		require.Equal(t, DefaultConfigSet.PageSize, cfg.PageSize)
		require.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
		require.Equal(t, DefaultConfigSet.BlockTime, cfg.BlockTime)
		require.Equal(t, DefaultConfigSet.BatchInsertSize, cfg.BatchInsertSize)
		require.Equal(t, DefaultConfigSet.MinBatchSize, cfg.MinBatchSize)
		require.Equal(t, DefaultConfigSet.SaveThreshold, cfg.SaveThreshold)
	})

	t.Run("preserves custom values and applies defaults to missing fields", func(t *testing.T) {
		customPageSize := uint32(250)
		customBlockTime := config.MustNewDuration(13 * time.Second)
		customBatchInsertSize := uint32(2000)

		cfg := &Config{
			PageSize:        customPageSize,
			BlockTime:       customBlockTime,
			BatchInsertSize: customBatchInsertSize,
		}
		cfg.ApplyDefaults()

		// Custom values
		require.Equal(t, customPageSize, cfg.PageSize)
		require.Equal(t, customBlockTime, cfg.BlockTime)
		require.Equal(t, customBatchInsertSize, cfg.BatchInsertSize)

		// Defaults
		require.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		require.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
		require.Equal(t, DefaultConfigSet.MinBatchSize, cfg.MinBatchSize)
		require.Equal(t, DefaultConfigSet.SaveThreshold, cfg.SaveThreshold)
	})

	t.Run("all fields set - nothing should change", func(t *testing.T) {
		customConfig := Config{
			PollPeriod:                config.MustNewDuration(1 * time.Second),
			PageSize:                  50,
			LogPollerStartingLookback: config.MustNewDuration(48 * time.Hour),
			BlockTime:                 config.MustNewDuration(1 * time.Second),
			BatchInsertSize:           2000,
			MinBatchSize:              250,
			SaveThreshold:             4000,
		}

		original := customConfig
		customConfig.ApplyDefaults()

		require.Equal(t, original.PollPeriod, customConfig.PollPeriod)
		require.Equal(t, original.PageSize, customConfig.PageSize)
		require.Equal(t, original.LogPollerStartingLookback, customConfig.LogPollerStartingLookback)
		require.Equal(t, original.BlockTime, customConfig.BlockTime)
		require.Equal(t, original.BatchInsertSize, customConfig.BatchInsertSize)
		require.Equal(t, original.MinBatchSize, customConfig.MinBatchSize)
		require.Equal(t, original.SaveThreshold, customConfig.SaveThreshold)
	})
}

func TestConfig_ValidateConfig(t *testing.T) {
	t.Run("valid config passes validation", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 3500,
			MinBatchSize:    500,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.NoError(t, err)
	})

	t.Run("default config passes validation", func(t *testing.T) {
		cfg := DefaultConfigSet
		err := cfg.ValidateConfig()
		require.NoError(t, err)
	})

	t.Run("fails when PageSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        0,
			BatchInsertSize: 3500,
			MinBatchSize:    500,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		require.Contains(t, err.Error(), "page_size")
	})

	t.Run("fails when BatchInsertSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 0,
			MinBatchSize:    500,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		require.Contains(t, err.Error(), "batch_insert_size")
	})

	t.Run("fails when BatchInsertSize exceeds PostgreSQL parameter limit", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 4000,
			MinBatchSize:    500,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
	})

	t.Run("fails when MinBatchSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 3500,
			MinBatchSize:    0,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		require.Contains(t, err.Error(), "min_batch_size")
	})

	t.Run("fails when SaveThreshold is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 3500,
			MinBatchSize:    500,
			SaveThreshold:   0,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		require.Contains(t, err.Error(), "save_threshold")
	})

	t.Run("fails when MinBatchSize > BatchInsertSize", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 500,
			MinBatchSize:    1000,
			SaveThreshold:   7000,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		require.Contains(t, err.Error(), "min_batch_size")
		require.Contains(t, err.Error(), "cannot be greater than")
	})

	t.Run("ApplyDefaults then ValidateConfig succeeds", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()
		err := cfg.ValidateConfig()
		require.NoError(t, err)
	})
}
