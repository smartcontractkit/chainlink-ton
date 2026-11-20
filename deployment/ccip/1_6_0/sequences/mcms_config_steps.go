package sequences

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
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
	if !supportsMultiStepSetConfig(contractVersion) || !opsmcms.NeedsTwoStep(currentSigners, currentGroups, &final) {
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
