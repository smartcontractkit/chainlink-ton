package logpoller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

func TestConfig_ApplyDefaults(t *testing.T) {
	t.Run("applies all defaults to empty config", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()

		assert.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		assert.Equal(t, DefaultConfigSet.PageSize, cfg.PageSize)
		assert.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
		assert.Equal(t, DefaultConfigSet.BlockTime, cfg.BlockTime)
		assert.Equal(t, DefaultConfigSet.BatchInsertSize, cfg.BatchInsertSize)
		assert.Equal(t, DefaultConfigSet.MinBatchSize, cfg.MinBatchSize)
		assert.Equal(t, DefaultConfigSet.SaveThreshold, cfg.SaveThreshold)
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
		assert.Equal(t, customPageSize, cfg.PageSize)
		assert.Equal(t, customBlockTime, cfg.BlockTime)
		assert.Equal(t, customBatchInsertSize, cfg.BatchInsertSize)

		// Defaults
		assert.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		assert.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
		assert.Equal(t, DefaultConfigSet.MinBatchSize, cfg.MinBatchSize)
		assert.Equal(t, DefaultConfigSet.SaveThreshold, cfg.SaveThreshold)
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

		assert.Equal(t, original.PollPeriod, customConfig.PollPeriod)
		assert.Equal(t, original.PageSize, customConfig.PageSize)
		assert.Equal(t, original.LogPollerStartingLookback, customConfig.LogPollerStartingLookback)
		assert.Equal(t, original.BlockTime, customConfig.BlockTime)
		assert.Equal(t, original.BatchInsertSize, customConfig.BatchInsertSize)
		assert.Equal(t, original.MinBatchSize, customConfig.MinBatchSize)
		assert.Equal(t, original.SaveThreshold, customConfig.SaveThreshold)
	})
}

func TestConfig_ValidateConfig(t *testing.T) {
	t.Run("valid config passes validation", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 4000,
			MinBatchSize:    500,
			SaveThreshold:   8000,
		}
		err := cfg.ValidateConfig()
		assert.NoError(t, err)
	})

	t.Run("default config passes validation", func(t *testing.T) {
		cfg := DefaultConfigSet
		err := cfg.ValidateConfig()
		assert.NoError(t, err)
	})

	t.Run("fails when PageSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        0,
			BatchInsertSize: 4000,
			MinBatchSize:    500,
			SaveThreshold:   8000,
		}
		err := cfg.ValidateConfig()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "page_size")
	})

	t.Run("fails when BatchInsertSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 0,
			MinBatchSize:    500,
			SaveThreshold:   8000,
		}
		err := cfg.ValidateConfig()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "batch_insert_size")
	})

	t.Run("fails when MinBatchSize is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 4000,
			MinBatchSize:    0,
			SaveThreshold:   8000,
		}
		err := cfg.ValidateConfig()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "min_batch_size")
	})

	t.Run("fails when SaveThreshold is zero", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 4000,
			MinBatchSize:    500,
			SaveThreshold:   0,
		}
		err := cfg.ValidateConfig()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "save_threshold")
	})

	t.Run("fails when MinBatchSize > BatchInsertSize", func(t *testing.T) {
		cfg := &Config{
			PageSize:        100,
			BatchInsertSize: 500,
			MinBatchSize:    1000,
			SaveThreshold:   8000,
		}
		err := cfg.ValidateConfig()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "min_batch_size")
		assert.Contains(t, err.Error(), "cannot be greater than")
	})

	t.Run("ApplyDefaults then ValidateConfig succeeds", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()
		err := cfg.ValidateConfig()
		assert.NoError(t, err)
	})
}
