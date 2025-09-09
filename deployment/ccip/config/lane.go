package config

type LaneConfig struct {
	Source     GenericChainDefinition
	Dest       GenericChainDefinition
	IsDisabled bool
}

// UpdateTonLanesConfig is a configuration struct for AddTonLanesChangeset
// Lanes accept different chain families
type UpdateTonLanesConfig struct {
	// EVMMCMSConfig defines the MCMS configuration for EVM chains.
	// EVMMCMSConfig *proposalutils.TimelockConfig
	// MCMSConfig defines the MCMS configuration for Ton chains.
	// TonMCMSConfig *proposalutils.TimelockConfig
	// Lanes describes the lanes that we want to create.
	Lanes []LaneConfig
	// TestRouter indicates if we want to enable these lanes on the test router.
	TestRouter bool
}
