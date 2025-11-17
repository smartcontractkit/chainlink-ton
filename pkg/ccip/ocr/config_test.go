package ocr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfig_ApplyDefaults(t *testing.T) {
	t.Run("applies all defaults when fields are zero", func(t *testing.T) {
		cfg := &Config{}
		cfg.ApplyDefaults()

		assert.InEpsilon(t, DefaultConfigSet.CommitPriceUpdateOnlyCostTON, cfg.CommitPriceUpdateOnlyCostTON, 0)
		assert.InEpsilon(t, DefaultConfigSet.CommitPriceAndRootCostTON, cfg.CommitPriceAndRootCostTON, 0)
		assert.InEpsilon(t, DefaultConfigSet.ExecuteCostTON, cfg.ExecuteCostTON, 0)
	})

	t.Run("preserves custom values", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.2,
			CommitPriceAndRootCostTON:    0.3,
			ExecuteCostTON:               0.25,
		}
		cfg.ApplyDefaults()

		assert.InEpsilon(t, 0.2, cfg.CommitPriceUpdateOnlyCostTON, 0)
		assert.InEpsilon(t, 0.3, cfg.CommitPriceAndRootCostTON, 0)
		assert.InEpsilon(t, 0.25, cfg.ExecuteCostTON, 0)
	})

	t.Run("applies defaults for some zero fields", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.3,
			ExecuteCostTON:               0.4,
		}
		cfg.ApplyDefaults()

		assert.InEpsilon(t, 0.3, cfg.CommitPriceUpdateOnlyCostTON, 0)
		assert.InEpsilon(t, DefaultConfigSet.CommitPriceAndRootCostTON, cfg.CommitPriceAndRootCostTON, 0)
		assert.InEpsilon(t, 0.4, cfg.ExecuteCostTON, 0)
	})
}

func TestConfig_ValidateConfig(t *testing.T) {
	t.Run("valid config passes validation", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.05,
			CommitPriceAndRootCostTON:    0.08,
			ExecuteCostTON:               0.1,
		}
		err := cfg.ValidateConfig()
		require.NoError(t, err)
	})

	t.Run("fails when CommitPriceUpdateOnlyCostTON is zero", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0,
			CommitPriceAndRootCostTON:    0.08,
			ExecuteCostTON:               0.1,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CommitPriceUpdateOnlyCostTON")
	})

	t.Run("fails when CommitPriceAndRootCostTON is zero", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.05,
			CommitPriceAndRootCostTON:    0,
			ExecuteCostTON:               0.1,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CommitPriceAndRootCostTON")
	})

	t.Run("fails when ExecuteCostTON is zero", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.05,
			CommitPriceAndRootCostTON:    0.08,
			ExecuteCostTON:               0,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ExecuteCostTON")
	})

	t.Run("fails when all fields are zero", func(t *testing.T) {
		cfg := &Config{}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CommitPriceUpdateOnlyCostTON")
		assert.Contains(t, err.Error(), "CommitPriceAndRootCostTON")
		assert.Contains(t, err.Error(), "ExecuteCostTON")
	})
}

func TestDefaultConfigSet(t *testing.T) {
	t.Run("default config has non-zero values", func(t *testing.T) {
		assert.Greater(t, DefaultConfigSet.CommitPriceUpdateOnlyCostTON, 0.0)
		assert.Greater(t, DefaultConfigSet.CommitPriceAndRootCostTON, 0.0)
		assert.Greater(t, DefaultConfigSet.ExecuteCostTON, 0.0)
	})

	t.Run("default config passes validation", func(t *testing.T) {
		err := DefaultConfigSet.ValidateConfig()
		require.NoError(t, err)
	})
}
