package bindings

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
)

// GetterMap is a map of getter method names to their Getter definitions.
// This allows generic access to contract getters by name.
type GetterMap map[string]interface{}

// TypeToGetterMap is a registry mapping contract types to their available getters.
// The outer map keys are contract type identifiers (e.g., "com.chainlink.ton.ccip.Router").
// The inner map keys are getter method names (e.g., "owner", "onRamp").
// The values are Getter[A, R] instances representing typed getter methods.
var TypeToGetterMap = map[string]GetterMap{
	// CCIP contract types
	"com.chainlink.ton.ccip.Router": {
		"owner":              router.GetOwner,
		"pendingOwner":       router.GetPendingOwner,
		"rmn_owner":          router.GetRMNOwner,
		"rmn_pendingOwner":   router.GetRMNPendingOwner,
		"onRamp":             router.GetOnRamp,
		"destChainSelectors": router.GetDestChainSelectors,
	},
	"com.chainlink.ton.ccip.OnRamp": {
		"owner":              onramp.GetOwner,
		"pendingOwner":       onramp.GetPendingOwner,
		"destChainConfig":    onramp.GetDestChainConfig,
		"dynamicConfig":      onramp.GetDynamicConfig,
		"staticConfig":       onramp.GetStaticConfig,
		"destChainSelectors": onramp.GetDestChainSelectors,
	},
	"com.chainlink.ton.ccip.OffRamp": {
		"owner":                offramp.GetOwner,
		"pendingOwner":         offramp.GetPendingOwner,
		"ocr3Config":           offramp.GetOCR3Config,
		"config":               offramp.GetConfig,
		"sourceChainConfig":    offramp.GetSourceChainConfig,
		"sourceChainSelectors": offramp.GetSourceChainSelectors,
	},
	"com.chainlink.ton.ccip.FeeQuoter": {
		"owner":                    feequoter.GetOwner,
		"pendingOwner":             feequoter.GetPendingOwner,
		"destChainConfig":          feequoter.GetDestChainConfig,
		"destinationChainGasPrice": feequoter.GetDestinationChainGasPrice,
		"tokenPrice":               feequoter.GetTokenPrice,
		"staticConfig":             feequoter.GetStaticConfig,
		"destChainSelectors":       feequoter.GetDestChainSelectors,
	},
	// Common contract getters (applies to all CCIP contracts)
	"com.chainlink.ton.ccip.Common": {
		"typeAndVersion": common.GetTypeAndVersion,
	},
	// Ownable2Step pattern (inherited by many contracts)
	"com.chainlink.ton.lib.access.Ownable2Step": {
		"owner":        ownable2step.GetOwner,
		"pendingOwner": ownable2step.GetPendingOwner,
	},
	// MCMS contract types
	"com.chainlink.ton.mcms.MCMS": {
		"getConfig":       mcms.GetConfig,
		"getOpCount":      mcms.GetOpCount,
		"getRoot":         mcms.GetRoot,
		"getRootMetadata": mcms.GetRootMetadata,
	},
	"com.chainlink.ton.mcms.Timelock": {
		"getMinDelay":        timelock.GetMinDelay,
		"getRoleMemberCount": timelock.GetRoleMemberCount,
		"getRoleMember":      timelock.GetRoleMember,
		"isOperation":        timelock.IsOperation,
		"isOperationPending": timelock.IsOperationPending,
		"isOperationReady":   timelock.IsOperationReady,
		"isOperationDone":    timelock.IsOperationDone,
		"isOperationError":   timelock.IsOperationError,
	},
}
