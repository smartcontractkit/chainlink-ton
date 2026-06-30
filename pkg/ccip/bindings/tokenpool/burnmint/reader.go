package burnmint

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Getters from burn_mint/contract.tolk ---

// GetHasPendingBurn checks if there is a pending burn operation for the given query ID.
//
// On-chain: get fun hasPendingBurn(queryId: uint64): bool
var GetHasPendingBurn = tvm.Getter[uint64, bool]{
	Name: "hasPendingBurn",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - hasPendingBurn: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// GetHasPendingMint checks if there is a pending mint operation for the given query ID.
//
// On-chain: get fun hasPendingMint(queryId: uint64): bool
var GetHasPendingMint = tvm.Getter[uint64, bool]{
	Name: "hasPendingMint",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - hasPendingMint: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

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
