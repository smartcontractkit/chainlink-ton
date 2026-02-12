package config

import (
	utilsmcms "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
)

type LaneConfig struct {
	Source        ChainDefinition
	Dest          ChainDefinition
	OnRampVersion []byte
	OnRamp        []byte
	IsDisabled    bool
}

// UpdateTonLanesConfig is a configuration struct for AddTonLanesChangeset
// Lanes accept different chain families
type UpdateTonLanesConfig struct {
	// Lanes describes the lanes that we want to create.
	Lanes []LaneConfig
	// TestRouter indicates if we want to enable these lanes on the test router.
	TestRouter bool

	// MCMS input configuration required to create proposals
	MCMS utilsmcms.Input
}
