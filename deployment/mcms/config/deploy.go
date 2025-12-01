package config

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
)

type ChainContractParams struct {
	TimelockParams TimelockParams
	MCMSParams     MCMSParams
}

func (c ChainContractParams) Validate() error {
	// Validate every field
	if err := c.TimelockParams.Validate(); err != nil {
		return fmt.Errorf("invalid TimelockParams: %w", err)
	}
	if err := c.MCMSParams.Validate(); err != nil {
		return fmt.Errorf("invalid MCMSParams: %w", err)
	}
	return nil
}

type TimelockParams struct {
	ID              uint32
	ContractsSemver *semver.Version
	Coin            string
	MinDelay        uint32
	Admin           *address.Address
	Proposers       []*address.Address
	Executors       []*address.Address
	Cancellers      []*address.Address
	Bypassers       []*address.Address
}

func (t TimelockParams) Validate() error {
	if t.Admin == nil {
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
