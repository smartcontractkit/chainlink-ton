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
	})

	t.Run("preserves custom values and applies defaults to missing fields", func(t *testing.T) {
		customPageSize := uint32(250)
		customBlockTime := config.MustNewDuration(13 * time.Second)

		cfg := &Config{
			PageSize:  customPageSize,
			BlockTime: customBlockTime,
		}
		cfg.ApplyDefaults()

		// Custom values
		assert.Equal(t, customPageSize, cfg.PageSize)
		assert.Equal(t, customBlockTime, cfg.BlockTime)

		// Defaults
		assert.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		assert.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
	})

	t.Run("all fields set - nothing should change", func(t *testing.T) {
		customConfig := Config{
			PollPeriod:                config.MustNewDuration(1 * time.Second),
			PageSize:                  50,
			LogPollerStartingLookback: config.MustNewDuration(48 * time.Hour),
			BlockTime:                 config.MustNewDuration(1 * time.Second),
		}

		original := customConfig
		customConfig.ApplyDefaults()

		assert.Equal(t, original.PollPeriod, customConfig.PollPeriod)
		assert.Equal(t, original.PageSize, customConfig.PageSize)
		assert.Equal(t, original.LogPollerStartingLookback, customConfig.LogPollerStartingLookback)
		assert.Equal(t, original.BlockTime, customConfig.BlockTime)
	})
}
