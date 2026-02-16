package config

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/xssnick/tonutils-go/address"
)

type TokenSymbol string

type ChainContractParams struct {
	FeeQuoterParams FeeQuoterParams
	OffRampParams   OffRampParams
	OnRampParams    OnRampParams
	RouterParams    RouterParams
	ReceiverParams  ReceiverParams
}

func (c ChainContractParams) Validate() error {
	// Validate every field
	if err := c.FeeQuoterParams.Validate(); err != nil {
		return fmt.Errorf("invalid FeeQuoterParams: %w", err)
	}
	if err := c.OffRampParams.Validate(); err != nil {
		return fmt.Errorf("invalid OffRampParams: %w", err)
	}
	if err := c.OnRampParams.Validate(); err != nil {
		return fmt.Errorf("invalid OnRampParams: %w", err)
	}
	if err := c.RouterParams.Validate(); err != nil {
		return fmt.Errorf("invalid RouterParams: %w", err)
	}
	if err := c.ReceiverParams.Validate(); err != nil {
		return fmt.Errorf("invalid ReceiverParams: %w", err)
	}
	return nil
}

type FeeToken struct {
	Address                    *address.Address
	PremiumMultiplierWeiPerEth uint64
}

type FeeQuoterParams struct {
	ID                           uint32
	ContractsSemver              *semver.Version
	Coin                         string
	MaxFeeJuelsPerMsg            *big.Int
	TokenPriceStalenessThreshold uint32
	FeeTokens                    map[TokenSymbol]FeeToken
}

func (f FeeQuoterParams) Validate() error {
	if f.TokenPriceStalenessThreshold == 0 {
		return errors.New("TokenPriceStalenessThreshold can't be 0")
	}
	if len(f.FeeTokens) == 0 {
		return errors.New("FeeTokens is nil or empty, at least one token must be configured")
	}
	if f.MaxFeeJuelsPerMsg == nil {
		return errors.New("MaxFeeJuelsPerMsg is nil, it must be set")
	}
	return nil
}

type OffRampParams struct {
	ID                               uint32
	ContractsSemver                  *semver.Version
	Coin                             string
	ChainSelector                    uint64
	PermissionlessExecutionThreshold uint32
}

func (o OffRampParams) Validate() error {
	if err := cldf.IsValidChainSelector(o.ChainSelector); err != nil {
		return fmt.Errorf("invalid chain selector: %d - %w", o.ChainSelector, err)
	}
	if o.PermissionlessExecutionThreshold == 0 {
		return errors.New("PermissionlessExecutionThreshold can't be 0")
	}
	return nil
}

type OnRampParams struct {
	ID              uint32
	ContractsSemver *semver.Version
	Coin            string
	ChainSelector   uint64
	AllowlistAdmin  *address.Address
	FeeAggregator   *address.Address
	Reserve         string
}

func (o OnRampParams) Validate() error {
	if err := cldf.IsValidChainSelector(o.ChainSelector); err != nil {
		return fmt.Errorf("invalid chain selector: %d - %w", o.ChainSelector, err)
	}
	return nil
}

type RouterParams struct {
	ID              uint32
	Coin            string
	ContractsSemver *semver.Version
}

func (r RouterParams) Validate() error {
	// No specific validation for now
	return nil
}

type ReceiverParams struct {
	ID              uint32
	ContractsSemver *semver.Version
	Coin            string
}

func (r ReceiverParams) Validate() error {
	// No specific validation for now
	return nil
}
