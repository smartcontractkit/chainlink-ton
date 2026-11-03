package sequences

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

const (
	// Safe single-step setConfig thresholds for the live TON 1.6.2 contracts.
	// Above either limit on either the current or final config, apply an
	// intermediate config first. Calibrated with the release-1.6.2 limits suite:
	// 52/21 -> 52/21 succeeds, 52/21 -> 56/21 is ~974k gas, and 60/21 -> 56/21
	// or 60/21 OOGs. Use 52/21 as the safe boundary.
	maxSingleStepSigners = 52
	maxSingleStepGroups  = 21
)

// multiStepSetConfigVersion is the only MCMS version that needs the temporary
// intermediate-config workaround. Remove this gate and the multi-step path once
// this version is no longer live.
var multiStepSetConfigVersion = semver.MustParse("0.0.4")

var defaultTonDeployAdapter = NewTonDeployAdapter(nil)

// SetTonDeployAdapterIntermediateConfig injects the approved intermediate config
// into the registered TON deployer adapter. CLD should call this during pipeline
// setup before running update_mcms_config_cllccip on TON.
func SetTonDeployAdapterIntermediateConfig(config *mcmstypes.Config) {
	defaultTonDeployAdapter.mcmsIntermediateConfig = config
}

// configSteps returns the ordered setConfig steps for a contract.
//
// For configs above the safe single-step threshold, the adapter applies the
// injected intermediate config first, then the final config. Both calls stay in
// the same Timelock batch, preserving order and allowing recovery if the final
// call fails.
func (a *TonDeployAdapter) configSteps(contractVersion *semver.Version, currentSigners, currentGroups int, final mcmstypes.Config) ([]mcmstypes.Config, error) {
	if !supportsMultiStepSetConfig(contractVersion) || !needsTwoStep(currentSigners, currentGroups, final) {
		return []mcmstypes.Config{final}, nil
	}

	if a.mcmsIntermediateConfig == nil {
		return nil, errors.New("MCMS config requires two-step setConfig but no intermediate config is configured")
	}
	if err := a.mcmsIntermediateConfig.Validate(); err != nil {
		return nil, fmt.Errorf("invalid intermediate MCMS config: %w", err)
	}
	if a.mcmsIntermediateConfig.Equals(&final) {
		return nil, errors.New("intermediate MCMS config must differ from final config")
	}

	return []mcmstypes.Config{*a.mcmsIntermediateConfig, final}, nil
}

func supportsMultiStepSetConfig(contractVersion *semver.Version) bool {
	return contractVersion != nil && contractVersion.Equal(multiStepSetConfigVersion)
}

func needsTwoStep(currentSigners, currentGroups int, final mcmstypes.Config) bool {
	finalSigners := len(final.AllSigners())
	finalGroups := countGroups(&final)
	return currentSigners > maxSingleStepSigners ||
		currentGroups > maxSingleStepGroups ||
		finalSigners > maxSingleStepSigners ||
		finalGroups > maxSingleStepGroups
}

func activeGroupCount(quorums *tlbe.Dict[uint8, uint8]) int {
	if quorums == nil {
		return 0
	}

	count := 0
	for group, quorum := range quorums.AsMap() {
		if group != 0 && quorum > 0 {
			count++
		}
	}
	return count
}

func countGroups(config *mcmstypes.Config) int {
	count := len(config.GroupSigners)
	for i := range config.GroupSigners {
		count += countGroups(&config.GroupSigners[i])
	}
	return count
}
