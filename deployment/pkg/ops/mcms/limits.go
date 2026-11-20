package mcms

import (
	"github.com/Masterminds/semver/v3"
	mcmstypes "github.com/smartcontractkit/mcms/types"
)

const (
	// MaxSingleStepSigners is the largest signer set that fits in one setConfig call.
	MaxSingleStepSigners = 52
	// MaxSingleStepGroups is the largest number of groups that fits in one setConfig call.
	MaxSingleStepGroups = 21
)

// StagedSetConfigMinVersion is the first MCMS version with staged config entrypoints.
var StagedSetConfigMinVersion = semver.MustParse("0.0.5")

// ConfigExceedsSingleStepLimits reports whether the final config is too large for a
// single setConfig call. The current config does not matter for staged-capable
// contracts because setConfig builds the replacement config from scratch.
func ConfigExceedsSingleStepLimits(config *mcmstypes.Config) bool {
	if config == nil {
		return false
	}
	return len(config.AllSigners()) > MaxSingleStepSigners || countConfigGroups(config) > MaxSingleStepGroups
}

// NeedsStagedConfig reports whether a contract version supports staged setConfig and
// the final config requires it. The deploy and update sequences use the same decision.
func NeedsStagedConfig(version *semver.Version, config *mcmstypes.Config) bool {
	return version != nil &&
		!version.LessThan(StagedSetConfigMinVersion) &&
		ConfigExceedsSingleStepLimits(config)
}

// NeedsTwoStep reports whether the legacy two-step workaround is required. It
// considers the current config because older setConfig implementations retain
// storage for the old config while applying the replacement.
func NeedsTwoStep(currentSigners, currentGroups int, config *mcmstypes.Config) bool {
	return currentSigners > MaxSingleStepSigners ||
		currentGroups > MaxSingleStepGroups ||
		ConfigExceedsSingleStepLimits(config)
}

func countConfigGroups(config *mcmstypes.Config) int {
	count := len(config.GroupSigners)
	for i := range config.GroupSigners {
		count += countConfigGroups(&config.GroupSigners[i])
	}
	return count
}
