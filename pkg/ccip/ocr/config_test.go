package ocr

import (
	"math"
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
		assert.InEpsilon(t, DefaultConfigSet.MaxExecuteValueTON, cfg.MaxExecuteValueTON, 0)
	})

	t.Run("preserves custom values", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.2,
			CommitPriceAndRootCostTON:    0.3,
			ExecuteCostTON:               0.25,
			MaxExecuteValueTON:           12,
		}
		cfg.ApplyDefaults()

		assert.InEpsilon(t, 0.2, cfg.CommitPriceUpdateOnlyCostTON, 0)
		assert.InEpsilon(t, 0.3, cfg.CommitPriceAndRootCostTON, 0)
		assert.InEpsilon(t, 0.25, cfg.ExecuteCostTON, 0)
		assert.InEpsilon(t, 12.0, cfg.MaxExecuteValueTON, 0)
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
			ExecuteCostTONTokenTransfer:  0.05,
			MaxExecuteValueTON:           5,
		}
		err := cfg.ValidateConfig()
		require.NoError(t, err)
	})

	t.Run("fails when CommitPriceUpdateOnlyCostTON is zero", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0,
			CommitPriceAndRootCostTON:    0.08,
			ExecuteCostTON:               0.1,
			ExecuteCostTONTokenTransfer:  0.05,
			MaxExecuteValueTON:           5,
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
			ExecuteCostTONTokenTransfer:  0.05,
			MaxExecuteValueTON:           5,
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
			ExecuteCostTONTokenTransfer:  0.05,
			MaxExecuteValueTON:           5,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ExecuteCostTON")
	})

	t.Run("fails when ExecuteCostTONTokenTransfer is zero", func(t *testing.T) {
		cfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.05,
			CommitPriceAndRootCostTON:    0.08,
			ExecuteCostTON:               0.1,
			ExecuteCostTONTokenTransfer:  0,
			MaxExecuteValueTON:           5,
		}
		err := cfg.ValidateConfig()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ExecuteCostTON")
	})

	t.Run("fails on non-finite values", func(t *testing.T) {
		for _, v := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
			cfg := DefaultConfigSet
			cfg.CommitPriceAndRootCostTON = v
			cfg.MaxExecuteValueTON = v
			err := cfg.ValidateConfig()
			require.Error(t, err)
			assert.Contains(t, err.Error(), "CommitPriceAndRootCostTON")
			assert.Contains(t, err.Error(), "MaxExecuteValueTON")
		}
	})

	t.Run("fails on values finer than nanoTON precision", func(t *testing.T) {
		for _, v := range []float64{0.0000000001, 1.0000000005, 2.1234567891} {
			cfg := DefaultConfigSet
			cfg.MaxExecuteValueTON = v
			cfg.ExecuteCostTONTokenTransfer = v
			err := cfg.ValidateConfig()
			require.Error(t, err, "value %v", v)
			assert.Contains(t, err.Error(), "MaxExecuteValueTON")
			assert.Contains(t, err.Error(), "ExecuteCostTONTokenTransfer")
			assert.Contains(t, err.Error(), "more than 9 decimal places")
		}
	})

	t.Run("fails when MaxExecuteValueTON is below ExecuteCostTON", func(t *testing.T) {
		cfg := DefaultConfigSet
		cfg.MaxExecuteValueTON = cfg.ExecuteCostTON / 2
		err := cfg.ValidateConfig()
		require.ErrorContains(t, err, "must not be lower than ExecuteCostTON")
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
		assert.Greater(t, DefaultConfigSet.ExecuteCostTONTokenTransfer, 0.0)
		assert.Greater(t, DefaultConfigSet.MaxExecuteValueTON, 0.0)
	})

	t.Run("default config passes validation", func(t *testing.T) {
		err := DefaultConfigSet.ValidateConfig()
		require.NoError(t, err)
	})
}

func TestTonFromFloat(t *testing.T) {
	for _, tt := range []struct {
		in   float64
		nano int64
	}{
		{0.085, 85_000_000},
		{1.9999996, 1_999_999_600},
		{2.0000004, 2_000_000_400},
		{0.000000001, 1},
		{4.2, 4_200_000_000},
	} {
		c, err := tonFromFloat(tt.in)
		require.NoError(t, err, "value %v", tt.in)
		assert.Equal(t, tt.nano, c.Nano().Int64(), "value %v", tt.in)
	}

	a, b := 0.1, 0.2
	_, err := tonFromFloat(a + b) // 0.30000000000000004
	require.ErrorContains(t, err, "more than 9 decimal places")
}
