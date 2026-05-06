package txm

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

		assert.Equal(t, DefaultConfigSet.BroadcastChanSize, cfg.BroadcastChanSize)
		assert.Equal(t, DefaultConfigSet.ConfirmPollInterval, cfg.ConfirmPollInterval)
		assert.Equal(t, DefaultConfigSet.SendRetryDelay, cfg.SendRetryDelay)
		assert.Equal(t, DefaultConfigSet.MaxSendRetryAttempts, cfg.MaxSendRetryAttempts)
		assert.Equal(t, DefaultConfigSet.MaxSendRetryDelay, cfg.MaxSendRetryDelay)
		assert.Equal(t, DefaultConfigSet.TxExpiration, cfg.TxExpiration)
		assert.Equal(t, DefaultConfigSet.CleanupInterval, cfg.CleanupInterval)
	})

	t.Run("preserves custom values and applies defaults to missing fields", func(t *testing.T) {
		customBroadcastSize := uint(500)
		customRetryDelay := config.MustNewDuration(15 * time.Second)

		cfg := &Config{
			BroadcastChanSize: customBroadcastSize,
			SendRetryDelay:    customRetryDelay,
		}
		cfg.ApplyDefaults()

		// Custom values
		assert.Equal(t, customBroadcastSize, cfg.BroadcastChanSize)
		assert.Equal(t, customRetryDelay, cfg.SendRetryDelay)

		// Defaults
		assert.Equal(t, DefaultConfigSet.ConfirmPollInterval, cfg.ConfirmPollInterval)
		assert.Equal(t, DefaultConfigSet.MaxSendRetryAttempts, cfg.MaxSendRetryAttempts)
		assert.Equal(t, DefaultConfigSet.MaxSendRetryDelay, cfg.MaxSendRetryDelay)
		assert.Equal(t, DefaultConfigSet.TxExpiration, cfg.TxExpiration)
		assert.Equal(t, DefaultConfigSet.CleanupInterval, cfg.CleanupInterval)
	})

	t.Run("all fields set - nothing should change", func(t *testing.T) {
		customConfig := Config{
			BroadcastChanSize:    999,
			ConfirmPollInterval:  config.MustNewDuration(1 * time.Second),
			SendRetryDelay:       config.MustNewDuration(2 * time.Second),
			MaxSendRetryAttempts: 10,
			MaxSendRetryDelay:    config.MustNewDuration(1 * time.Minute),
			TxExpiration:         config.MustNewDuration(10 * time.Minute),
			CleanupInterval:      config.MustNewDuration(120 * time.Minute),
		}

		original := customConfig
		customConfig.ApplyDefaults()

		// All values should remain unchanged
		assert.Equal(t, original.BroadcastChanSize, customConfig.BroadcastChanSize)
		assert.Equal(t, original.ConfirmPollInterval, customConfig.ConfirmPollInterval)
		assert.Equal(t, original.SendRetryDelay, customConfig.SendRetryDelay)
		assert.Equal(t, original.MaxSendRetryAttempts, customConfig.MaxSendRetryAttempts)
		assert.Equal(t, original.TxExpiration, customConfig.TxExpiration)
		assert.Equal(t, original.CleanupInterval, customConfig.CleanupInterval)
	})
}
