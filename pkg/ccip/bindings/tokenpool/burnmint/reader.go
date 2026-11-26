package burnmint

import (
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// --- Getters from burn_mint/contract.tolk ---

// GetTypeAndVersion gets the contract type and version.
//
// On-chain: get fun typeAndVersion(): (slice, slice)
var GetTypeAndVersion = common.GetTypeAndVersion

// Re-export common getters from the parent tokenpool package.
var (
	GetOwner                   = tokenpool.GetOwner
	GetPendingOwner            = tokenpool.GetPendingOwner
	GetFacilityId              = tokenpool.GetFacilityId
	GetErrorCode               = tokenpool.GetErrorCode
	GetRMNOwner                = tokenpool.GetRMNOwner
	GetRMNPendingOwner         = tokenpool.GetRMNPendingOwner
	GetRMNHasRole              = tokenpool.GetRMNHasRole
	GetRMNRoleAdmin            = tokenpool.GetRMNRoleAdmin
	GetRMNCanCurse             = tokenpool.GetRMNCanCurse
	GetRMNCanUncurse           = tokenpool.GetRMNCanUncurse
	GetToken                   = tokenpool.GetToken
	GetIsSupportedToken        = tokenpool.GetIsSupportedToken
	GetTokenDecimals           = tokenpool.GetTokenDecimals
	GetIsSupportedChain        = tokenpool.GetIsSupportedChain
	GetSupportedChains         = tokenpool.GetSupportedChains
	GetVerifyNotCursed         = tokenpool.GetVerifyNotCursed
	GetDynamicConfig           = tokenpool.GetDynamicConfig
	GetAllowedFinalityConfig   = tokenpool.GetAllowedFinalityConfig
	GetBudget                  = tokenpool.GetBudget
	GetAdvancedPoolHooks       = tokenpool.GetAdvancedPoolHooks
	GetIsRemotePool            = tokenpool.GetIsRemotePool
	GetRemoteToken             = tokenpool.GetRemoteToken
	GetRemotePools             = tokenpool.GetRemotePools
	GetTokenTransferFeeConfig  = tokenpool.GetTokenTransferFeeConfig
	GetCurrentRateLimiterState = tokenpool.GetCurrentRateLimiterState
	GetCursedSubjects          = tokenpool.GetCursedSubjects
	GetAdminConfig             = tokenpool.GetAdminConfig
	GetRemoteChainConfig       = tokenpool.GetRemoteChainConfig
	GetFee                     = tokenpool.GetFee
	GetFeeAmount               = tokenpool.GetFeeAmount
	GetCCVAmount               = tokenpool.GetCCVAmount
	GetAccruedFees             = tokenpool.GetAccruedFees
	GetIsInitialized           = tokenpool.GetIsInitialized
)

// --- Re-export argument types for convenience ---

// IsRemotePoolArgs holds the arguments for the isRemotePool getter.
type IsRemotePoolArgs = tokenpool.IsRemotePoolArgs

// GetCurrentRateLimiterStateArgs holds the arguments for getCurrentRateLimiterState.
type GetCurrentRateLimiterStateArgs = tokenpool.GetCurrentRateLimiterStateArgs

// GetFeeArgs holds the arguments for the getFee getter.
type GetFeeArgs = tokenpool.GetFeeArgs

// GetFeeAmountArgs holds the arguments for the getFeeAmount getter.
type GetFeeAmountArgs = tokenpool.GetFeeAmountArgs

// GetCCVAmountArgs holds the arguments for the getCCVAmount getter.
type GetCCVAmountArgs = tokenpool.GetCCVAmountArgs

// GetTokenTransferFeeConfigResult holds the optional fee config result.
type GetTokenTransferFeeConfigResult = tokenpool.GetTokenTransferFeeConfigResult

// GetRemoteChainConfigResult holds the optional remote chain config result.
type GetRemoteChainConfigResult = tokenpool.GetRemoteChainConfigResult

// GetFeeResult holds the result of the getFee getter.
type GetFeeResult = tokenpool.GetFeeResult
