package config

import (
	"sync"

	cldf_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
)

// TON Local Network Configuration
//
// This package centralizes the TON local network (MyLocalTon) configuration used for testing.
// The versions here must be compatible with the current CCIP contract versions deployed in this repository.
//
// When to Update:
//   - When TON CCIP contracts are updated and require different network capabilities
//   - When mylocalton-docker adds features needed by the contracts
//   - When blockchain behavior changes affect contract execution

// LocalNetworkConfig returns the CTFChainProviderConfig compatible with current contract versions.
// The once parameter ensures the CTF network is only initialized once across the test suite.
func LocalNetworkConfig(once *sync.Once) cldf_provider.CTFChainProviderConfig {
	return cldf_provider.CTFChainProviderConfig{
		Once: once,
		// LocalNetworkImage is the TON local network Docker image version compatible with current contracts.
		// Source: https://github.com/neodix42/mylocalton-docker
		Image: "ghcr.io/neodix42/mylocalton-docker:v3.7",
		CustomEnv: map[string]string{
			// LocalNetworkVersionCapabilities is the VERSION_CAPABILITIES setting compatible with current contracts.
			// This controls which TVM features are enabled in the local network.
			"VERSION_CAPABILITIES": "11",
			// LocalNetworkBlockGenerationDelay is the recommended block generation delay for faster testing.
			"NEXT_BLOCK_GENERATION_DELAY": "0.5",
		},
	}
}
