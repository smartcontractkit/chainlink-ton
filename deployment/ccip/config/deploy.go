package config

import (
	"errors"
	"fmt"
	"math/big"

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
	TimelockParams  TimelockParams
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
	return nil
}

type FeeToken struct {
	Address                    *address.Address
	PremiumMultiplierWeiPerEth uint64
}

type FeeQuoterParams struct {
	ID                           uint32
	MaxFeeJuelsPerMsg            *big.Int
	TokenPriceStalenessThreshold uint64
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
	ID             uint32
	ChainSelector  uint64
	AllowlistAdmin *address.Address
	FeeAggregator  *address.Address
}

func (o OnRampParams) Validate() error {
	if err := cldf.IsValidChainSelector(o.ChainSelector); err != nil {
		return fmt.Errorf("invalid chain selector: %d - %w", o.ChainSelector, err)
	}
	return nil
}

type RouterParams struct {
	ID uint32
}

func (r RouterParams) Validate() error {
	// No specific validation for now
	return nil
}

type ReceiverParams struct {
	ID uint32
}

func (r ReceiverParams) Validate() error {
	// No specific validation for now
	return nil
}

type TimelockParams struct {
	ID         uint32
	MinDelay   uint32
	Admin      *address.Address
	Proposers  []*address.Address
	Executors  []*address.Address
	Cancellers []*address.Address
	Bypassers  []*address.Address
}

func (t TimelockParams) Validate() error {
	if t.Admin == nil {
		return errors.New("timelock admin should be specified")
	}

	return nil
}
