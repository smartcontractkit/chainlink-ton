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
		require.Equal(t, DefaultConfigSet.MCBlockCacheSize, cfg.MCBlockCacheSize)
		require.Equal(t, DefaultConfigSet.MCBlockResolveMaxRetries, cfg.MCBlockResolveMaxRetries)
		require.Equal(t, DefaultConfigSet.MCBlockResolveBaseDelay, cfg.MCBlockResolveBaseDelay)
		require.Equal(t, DefaultConfigSet.PruningInterval, cfg.PruningInterval)
		require.Equal(t, DefaultConfigSet.PruningBatchSize, cfg.PruningBatchSize)
		require.Equal(t, DefaultConfigSet.PruningStartDelay, cfg.PruningStartDelay)
	})

	t.Run("preserves custom values and applies defaults to missing fields", func(t *testing.T) {
		cfg := &Config{
			PageSize:        250,
			BlockTime:       config.MustNewDuration(13 * time.Second),
			BatchInsertSize: 2000,
		}
		cfg.ApplyDefaults()

		// Custom values preserved
		require.Equal(t, uint32(250), cfg.PageSize)
		require.Equal(t, config.MustNewDuration(13*time.Second), cfg.BlockTime)
		require.Equal(t, uint32(2000), cfg.BatchInsertSize)

		// Defaults applied
		require.Equal(t, DefaultConfigSet.PollPeriod, cfg.PollPeriod)
		require.Equal(t, DefaultConfigSet.LogPollerStartingLookback, cfg.LogPollerStartingLookback)
		require.Equal(t, DefaultConfigSet.MinBatchSize, cfg.MinBatchSize)
		require.Equal(t, DefaultConfigSet.SaveThreshold, cfg.SaveThreshold)
	})

	t.Run("all fields set - nothing should change", func(t *testing.T) {
		original := Config{
			PollPeriod:                config.MustNewDuration(1 * time.Second),
			PageSize:                  50,
			LogPollerStartingLookback: config.MustNewDuration(48 * time.Hour),
			BlockTime:                 config.MustNewDuration(1 * time.Second),
			BatchInsertSize:           2000,
			MinBatchSize:              250,
			SaveThreshold:             4000,
			MCBlockCacheSize:          2000,
			MCBlockResolveMaxRetries:  5,
			MCBlockResolveBaseDelay:   config.MustNewDuration(200 * time.Millisecond),
			PruningInterval:           config.MustNewDuration(5 * time.Minute),
			PruningBatchSize:          500,
			PruningStartDelay:         config.MustNewDuration(2 * time.Minute),
		}

		cfg := original
		cfg.ApplyDefaults()

		require.Equal(t, original, cfg)
	})
}

// validConfig returns a Config that passes all validations.
func validConfig() *Config {
	return &Config{
		PageSize:          100,
		BatchInsertSize:   3000,
		MinBatchSize:      500,
		SaveThreshold:     8000,
		PollPeriod:        config.MustNewDuration(5 * time.Second),
		PruningInterval:   config.MustNewDuration(10 * time.Minute),
		PruningBatchSize:  1000,
		PruningStartDelay: config.MustNewDuration(1 * time.Minute),
	}
}

func TestConfig_ValidateConfig(t *testing.T) {
	t.Run("default config passes", func(t *testing.T) {
		require.NoError(t, DefaultConfigSet.ValidateConfig())
	})

	t.Run("ApplyDefaults then ValidateConfig succeeds", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()
		require.NoError(t, cfg.ValidateConfig())
	})

	validTests := []struct {
		name   string
		modify func(*Config)
	}{
		{"base config", func(c *Config) {}},
		{"PollPeriod at min boundary", func(c *Config) { c.PollPeriod = config.MustNewDuration(100 * time.Millisecond) }},
		{"PollPeriod at max boundary", func(c *Config) { c.PollPeriod = config.MustNewDuration(10 * time.Minute) }},
		{"PruningStartDelay at zero", func(c *Config) { c.PruningStartDelay = config.MustNewDuration(0) }},
	}

	for _, tc := range validTests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := validConfig()
			tc.modify(cfg)
			require.NoError(t, cfg.ValidateConfig())
		})
	}

	invalidTests := []struct {
		name   string
		modify func(*Config)
	}{
		{"PageSize is zero", func(c *Config) { c.PageSize = 0 }},
		{"BatchInsertSize is zero", func(c *Config) { c.BatchInsertSize = 0 }},
		{"BatchInsertSize exceeds PostgreSQL limit", func(c *Config) { c.BatchInsertSize = 4000 }},
		{"MinBatchSize is zero", func(c *Config) { c.MinBatchSize = 0 }},
		{"SaveThreshold is zero", func(c *Config) { c.SaveThreshold = 0 }},
		{"MinBatchSize > BatchInsertSize", func(c *Config) { c.BatchInsertSize, c.MinBatchSize = 500, 1000 }},
		{"PollPeriod is nil", func(c *Config) { c.PollPeriod = nil }},
		{"PollPeriod is zero", func(c *Config) { c.PollPeriod = config.MustNewDuration(0) }},
		{"PollPeriod too small", func(c *Config) { c.PollPeriod = config.MustNewDuration(time.Millisecond) }},
		{"PollPeriod too large", func(c *Config) { c.PollPeriod = config.MustNewDuration(20 * time.Minute) }},
		{"PruningInterval is nil", func(c *Config) { c.PruningInterval = nil }},
		{"PruningInterval too small", func(c *Config) { c.PruningInterval = config.MustNewDuration(30 * time.Second) }},
		{"PruningInterval too large", func(c *Config) { c.PruningInterval = config.MustNewDuration(2 * time.Hour) }},
		{"PruningBatchSize too small", func(c *Config) { c.PruningBatchSize = 50 }},
		{"PruningBatchSize too large", func(c *Config) { c.PruningBatchSize = 20000 }},
	}

	for _, tc := range invalidTests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := validConfig()
			tc.modify(cfg)
			require.Error(t, cfg.ValidateConfig())
		})
	}
}
