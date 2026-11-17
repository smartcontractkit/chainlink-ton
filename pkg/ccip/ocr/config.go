package ocr

import (
	"errors"
	"math"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Config holds configuration parameters for the Contract Transmitter.
// NOTE: when adding new fields, please update ApplyDefaults, DefaultConfigSet, and ValidateConfig accordingly.
// Also check toml_test.go TestNewDecodedTOMLConfig() to ensure new fields are tested there.
type Config struct {
	CommitPriceUpdateOnlyCostTON float64 // Cost in TON for commit price update only (no merkle roots)
	CommitPriceAndRootCostTON    float64 // Cost in TON for commit price update with merkle roots
	ExecuteCostTON               float64 // Cost in TON for execute
	ExecuteCostTONTokenTransfer  float64 // Cost in TON for each token transfer in execute
	// Upper bound in TON on the total value attached to an execute transaction. Execute reports
	// above it are not transmitted. Must cover the lane's MaxPerMsgGasLimit plus the token
	// transfer budgets, otherwise valid messages cannot be executed.
	MaxExecuteValueTON float64
}

// TODO: switch to these values once the contracts are upgraded. They mirror the OffRamp min values
// (OffRamp_Costs.commit / execute in contracts/contracts/ccip/offramp/messages.tolk).
//
//	CommitPriceUpdateOnlyCostTON: 0.026,
//	CommitPriceAndRootCostTON:    0.0365,
//	ExecuteCostTON:               0.0675,
//	ExecuteCostTONTokenTransfer:  0.0545,
var DefaultConfigSet = Config{
	CommitPriceUpdateOnlyCostTON: 0.03,
	CommitPriceAndRootCostTON:    0.05,
	ExecuteCostTON:               0.085,
	ExecuteCostTONTokenTransfer:  0.10,
	MaxExecuteValueTON:           5,
}

func (c *Config) ApplyDefaults() {
	if c.CommitPriceUpdateOnlyCostTON == 0 {
		c.CommitPriceUpdateOnlyCostTON = DefaultConfigSet.CommitPriceUpdateOnlyCostTON
	}
	if c.CommitPriceAndRootCostTON == 0 {
		c.CommitPriceAndRootCostTON = DefaultConfigSet.CommitPriceAndRootCostTON
	}
	if c.ExecuteCostTON == 0 {
		c.ExecuteCostTON = DefaultConfigSet.ExecuteCostTON
	}
	if c.ExecuteCostTONTokenTransfer == 0 {
		c.ExecuteCostTONTokenTransfer = DefaultConfigSet.ExecuteCostTONTokenTransfer
	}
	if c.MaxExecuteValueTON == 0 {
		c.MaxExecuteValueTON = DefaultConfigSet.MaxExecuteValueTON
	}
}

func (c *Config) ValidateConfig() (err error) {
	for _, f := range []struct {
		name  string
		value float64
	}{
		{"CommitPriceUpdateOnlyCostTON", c.CommitPriceUpdateOnlyCostTON},
		{"CommitPriceAndRootCostTON", c.CommitPriceAndRootCostTON},
		{"ExecuteCostTON", c.ExecuteCostTON},
		{"ExecuteCostTONTokenTransfer", c.ExecuteCostTONTokenTransfer},
		{"MaxExecuteValueTON", c.MaxExecuteValueTON},
	} {
		if !(f.value > 0) || math.IsInf(f.value, 0) {
			err = errors.Join(err, config.ErrInvalid{Name: f.name, Value: f.value, Msg: "must be a finite number greater than 0"})
		}
	}
	if c.MaxExecuteValueTON < c.ExecuteCostTON {
		err = errors.Join(err, config.ErrInvalid{Name: "MaxExecuteValueTON", Value: c.MaxExecuteValueTON, Msg: "must not be lower than ExecuteCostTON"})
	}
	return err
}
