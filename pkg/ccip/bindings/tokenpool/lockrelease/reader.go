package lockrelease

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// --- Getters from lock_release/contract.tolk ---

// GetLockbox gets the lockbox address (for lock_release variant with lockbox support).
//
// On-chain: get fun lockbox(): address
var GetLockbox = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "lockbox",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - lockbox: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetTypeAndVersion gets the contract type and version.
//
// On-chain: get fun typeAndVersion(): (slice, slice)
var GetTypeAndVersion = common.GetTypeAndVersion

// Re-export common getters from the parent tokenpool package.
var (
	GetOwner                   = tokenpool.GetOwner
	GetPendingOwner            = tokenpool.GetPendingOwner
	GetToken                   = tokenpool.GetToken
	GetTokenDecimals           = tokenpool.GetTokenDecimals
	GetIsSupportedChain        = tokenpool.GetIsSupportedChain
	GetSupportedChains         = tokenpool.GetSupportedChains
	GetOnRamp                  = tokenpool.GetOnRamp
	GetOffRamp                 = tokenpool.GetOffRamp
	GetRMNProxy                = tokenpool.GetRMNProxy
	GetVerifyNotCursed         = tokenpool.GetVerifyNotCursed
	GetDynamicConfig           = tokenpool.GetDynamicConfig
	GetAllowedFinalityConfig   = tokenpool.GetAllowedFinalityConfig
	GetAdvancedPoolHooks       = tokenpool.GetAdvancedPoolHooks
	GetIsRemotePool            = tokenpool.GetIsRemotePool
	GetRemoteToken             = tokenpool.GetRemoteToken
	GetRemotePools             = tokenpool.GetRemotePools
	GetTokenTransferFeeConfig  = tokenpool.GetTokenTransferFeeConfig
	GetCurrentRateLimiterState = tokenpool.GetCurrentRateLimiterState
	GetCursedSubjects          = tokenpool.GetCursedSubjects
	GetAdminConfig             = tokenpool.GetAdminConfig
	GetMirroredPolicy          = tokenpool.GetMirroredPolicy
	GetRemoteChainConfig       = tokenpool.GetRemoteChainConfig
	GetFee                     = tokenpool.GetFee
)

// --- Re-export argument types for convenience ---

// IsRemotePoolArgs holds the arguments for the isRemotePool getter.
type IsRemotePoolArgs = tokenpool.IsRemotePoolArgs

// GetCurrentRateLimiterStateArgs holds the arguments for getCurrentRateLimiterState.
type GetCurrentRateLimiterStateArgs = tokenpool.GetCurrentRateLimiterStateArgs

// GetFeeArgs holds the arguments for the getFee getter.
type GetFeeArgs = tokenpool.GetFeeArgs

// GetTokenTransferFeeConfigResult holds the optional fee config result.
type GetTokenTransferFeeConfigResult = tokenpool.GetTokenTransferFeeConfigResult

// GetRemoteChainConfigResult holds the optional remote chain config result.
type GetRemoteChainConfigResult = tokenpool.GetRemoteChainConfigResult

// GetFeeResult holds the result of the getFee getter.
type GetFeeResult = tokenpool.GetFeeResult
