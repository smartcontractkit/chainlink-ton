package lockreleaselockbox

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Getters from lock_release_lockbox/contract.tolk ---
// This variant combines lock/release semantics with a JettonLockBox.
// It re-exports all common getters from the parent tokenpool package,
// plus variant-specific getters.

// --- Variant-specific getters ---

// GetHasPendingLock checks if there is a pending lock operation for the given query ID.
//
// On-chain: get fun hasPendingLock(queryId: uint64): bool
var GetHasPendingLock = tvm.Getter[uint64, bool]{
	Name: "hasPendingLock",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - hasPendingLock: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// GetHasPendingRelease checks if there is a pending release operation for the given query ID.
//
// On-chain: get fun hasPendingRelease(queryId: uint64): bool
var GetHasPendingRelease = tvm.Getter[uint64, bool]{
	Name: "hasPendingRelease",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - hasPendingRelease: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// GetLockbox gets the JettonLockBox address used by this token pool.
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

// --- Re-export all common getters from the parent tokenpool package ---
// These are shared across all token pool variants (burnmint, lockrelease, lockreleaselockbox).

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
