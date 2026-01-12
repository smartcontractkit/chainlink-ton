package config

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
)

type ChainContractParams struct {
	Timelock TimelockParams
	MCMS     MCMSParams
}

func (c ChainContractParams) Validate() error {
	// Validate every field
	if err := c.Timelock.Validate(); err != nil {
		return fmt.Errorf("invalid Timelock params: %w", err)
	}
	if err := c.MCMS.Validate(); err != nil {
		return fmt.Errorf("invalid MCMS params: %w", err)
	}
	return nil
}

type TimelockParams struct {
	ContractsSemver *semver.Version
	Coin            string
	// Data for Timelock deployment
	ID          uint32
	InitMessage timelock.Init
}

func (t TimelockParams) Validate() error {
	if t.InitMessage.Admin == nil {
		return errors.New("timelock admin should be specified")
	}

	return nil
}

type MCMSParams struct {
	ID              uint32
	ContractsSemver *semver.Version
	Coin            string
}

func (m MCMSParams) Validate() error {
	// No specific validation for now
	return nil
}
