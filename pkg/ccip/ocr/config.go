package ocr

import (
	"errors"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Config holds configuration parameters for the Contract Transmitter.
// NOTE: when adding new fields, please update ApplyDefaults, DefaultConfigSet, and ValidateConfig accordingly.
// Also check toml_test.go TestNewDecodedTOMLConfig() to ensure new fields are tested there.
type Config struct {
	CommitPriceUpdateOnlyCostTON float64 // Cost in TON for commit price update only
	CommitPerMessageCostTON      float64 // Cost in TON per message for commit
	ExecuteCostTON               float64 // Cost in TON for execute
}

var DefaultConfigSet = Config{
	CommitPriceUpdateOnlyCostTON: 0.05,
	CommitPerMessageCostTON:      0.01,
	ExecuteCostTON:               0.1,
}

func (c *Config) ApplyDefaults() {
	if c.CommitPriceUpdateOnlyCostTON == 0 {
		c.CommitPriceUpdateOnlyCostTON = DefaultConfigSet.CommitPriceUpdateOnlyCostTON
	}
	if c.CommitPerMessageCostTON == 0 {
		c.CommitPerMessageCostTON = DefaultConfigSet.CommitPerMessageCostTON
	}
	if c.ExecuteCostTON == 0 {
		c.ExecuteCostTON = DefaultConfigSet.ExecuteCostTON
	}
}

func (c *Config) ValidateConfig() (err error) {
	if c.CommitPriceUpdateOnlyCostTON == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "CommitPriceUpdateOnlyCostTON", Msg: "must be greater than 0"})
	}
	if c.CommitPerMessageCostTON == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "CommitPerMessageCostTON", Msg: "must be greater than 0"})
	}
	if c.ExecuteCostTON == 0 {
		err = errors.Join(err, config.ErrInvalid{Name: "ExecuteCostTON", Msg: "must be greater than 0"})
	}
	return err
}

