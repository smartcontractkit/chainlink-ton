package tokenpool

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Shared getters from token_pool.tolk (library) ---
// These getters are defined on the TokenPool library and are exposed by all
// token pool contract variants (burnmint, lockrelease, lockbox).
// They are implemented once here and re-exported by each sub-package.

// GetOwner gets the owner address (delegates to ownable2step).
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner address (delegates to ownable2step).
var GetPendingOwner = ownable2step.GetPendingOwner

// GetTypeAndVersion gets the contract type and version (delegates to common).
var GetTypeAndVersion = common.GetTypeAndVersion

// GetToken gets the Jetton token address that this pool serves.
//
// On-chain: get fun token(): address
var GetToken = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "token",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - token: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetTokenDecimals gets the Jetton token decimals on the local chain.
//
// On-chain: get fun tokenDecimals(): uint8
var GetTokenDecimals = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint8]{
	Name: "tokenDecimals",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint8, error) {
		v, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error getting Int(0) - tokenDecimals: %w", err)
		}
		return uint8(v.Uint64()), nil
	}),
})

// GetIsSupportedChain checks whether a remote chain is supported in the token pool.
//
// On-chain: get fun isSupportedChain(remoteChainSelector: uint64): bool
var GetIsSupportedChain = tvm.Getter[uint64, bool]{
	Name: "isSupportedChain",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - isSupportedChain: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// GetSupportedChains gets all supported chain selectors.
//
// On-chain: fun TokenPool<T>.getSupportedChains(self): lisp_list<uint64>
var GetSupportedChains = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]uint64]{
	Name: "getSupportedChains",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		selectors, err := parser.ParseLispTuple[*big.Int](r.AsTuple())
		if err != nil {
			return nil, err
		}
		return lo.Map(selectors, func(x *big.Int, _ int) uint64 { return x.Uint64() }), nil
	}),
})

// GetOnRamp gets the onRamp address for a given remote chain selector.
//
// On-chain: get fun onRamp(remoteChainSelector: uint64): address?
var GetOnRamp = tvm.Getter[uint64, *address.Address]{
	Name: "onRamp",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - onRamp: %w", err)
		}
		if isNil {
			return nil, nil
		}
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - onRamp: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
}

// GetOffRamp gets the offRamp address for a given remote chain selector.
//
// On-chain: get fun offRamp(remoteChainSelector: uint64): address?
var GetOffRamp = tvm.Getter[uint64, *address.Address]{
	Name: "offRamp",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - offRamp: %w", err)
		}
		if isNil {
			return nil, nil
		}
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - offRamp: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
}

// GetRMNProxy gets the RMN proxy address.
//
// On-chain: get fun getRMNProxy(): address
var GetRMNProxy = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "getRMNProxy",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - getRMNProxy: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetVerifyNotCursed checks if the input subject is not cursed.
//
// On-chain: get fun verifyNotCursed(subject: uint128): bool
var GetVerifyNotCursed = tvm.Getter[*big.Int, bool]{
	Name: "verifyNotCursed",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - verifyNotCursed: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// GetDynamicConfig gets the dynamic configuration for the pool.
//
// On-chain: fun TokenPool<T>.getDynamicConfig(self): TokenPool_DynamicConfig
var GetDynamicConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[DynamicConfig]{
	Name: "getDynamicConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (DynamicConfig, error) {
		var cfg DynamicConfig

		routerSlice, err := r.Slice(0)
		if err != nil {
			return cfg, fmt.Errorf("error getting Slice(0) - router: %w", err)
		}
		router, err := routerSlice.LoadAddr()
		if err != nil {
			return cfg, fmt.Errorf("error loading router address: %w", err)
		}
		cfg.Router = router

		// Check for maybe (nil) address - rateLimitAdmin
		isNil, err := r.IsNil(1)
		if err != nil {
			return cfg, fmt.Errorf("error checking IsNil(1) - rateLimitAdmin: %w", err)
		}
		if !isNil {
			//nolint:govet // allow shadowing
			sAddr, err := r.Slice(1)
			if err != nil {
				return cfg, fmt.Errorf("error getting Slice(1) - rateLimitAdmin: %w", err)
			}
			addr, err := sAddr.LoadAddr()
			if err != nil {
				return cfg, fmt.Errorf("error loading rateLimitAdmin address: %w", err)
			}
			cfg.RateLimitAdmin = addr
		}

		// Check for maybe (nil) address - feeAdmin
		isNil, err = r.IsNil(2)
		if err != nil {
			return cfg, fmt.Errorf("error checking IsNil(2) - feeAdmin: %w", err)
		}
		if !isNil {
			sAddr, err := r.Slice(2)
			if err != nil {
				return cfg, fmt.Errorf("error getting Slice(2) - feeAdmin: %w", err)
			}
			addr, err := sAddr.LoadAddr()
			if err != nil {
				return cfg, fmt.Errorf("error loading feeAdmin address: %w", err)
			}
			cfg.FeeAdmin = addr
		}

		return cfg, nil
	}),
})

// GetAllowedFinalityConfig gets the allowed finality config.
//
// On-chain: fun TokenPool<T>.getAllowedFinalityConfig(self): uint32
var GetAllowedFinalityConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint32]{
	Name: "getAllowedFinalityConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint32, error) {
		v, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error getting Int(0) - allowedFinalityConfig: %w", err)
		}
		return uint32(v.Uint64()), nil
	}),
})

// GetAdvancedPoolHooks gets the advanced pool hooks address.
//
// On-chain: fun TokenPool<T>.getAdvancedPoolHooks(self): address?
var GetAdvancedPoolHooks = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "getAdvancedPoolHooks",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - advancedPoolHooks: %w", err)
		}
		if isNil {
			return nil, nil
		}
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - advancedPoolHooks: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetIsRemotePool checks if the pool address is configured on the remote chain.
//
// On-chain: fun TokenPool<T>.isRemotePool(self, remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool
var GetIsRemotePool = tvm.Getter[IsRemotePoolArgs, bool]{
	Name: "isRemotePool",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - isRemotePool: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// IsRemotePoolArgs holds the arguments for the isRemotePool getter.
type IsRemotePoolArgs struct {
	RemoteChainSelector uint64
	RemotePoolAddress   common.CrossChainAddress
}

// GetRemoteToken gets the token address on the remote chain.
//
// On-chain: fun TokenPool<T>.getRemoteToken(self, remoteChainSelector: uint64): Cell<CrossChainAddress>
var GetRemoteToken = tvm.Getter[uint64, common.CrossChainAddress]{
	Name: "getRemoteToken",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (common.CrossChainAddress, error) {
		cs, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - remoteToken: %w", err)
		}
		addr, err := common.LoadCrossChainAddressWithoutPrefix(cs)
		if err != nil {
			return nil, fmt.Errorf("error loading CrossChainAddress: %w", err)
		}
		return addr, nil
	}),
}

// GetRemotePools gets all pool addresses configured for a remote chain.
//
// On-chain: fun TokenPool<T>.getRemotePools(self, remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>>
var GetRemotePools = tvm.Getter[uint64, []common.CrossChainAddress]{
	Name: "getRemotePools",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]common.CrossChainAddress, error) {
		cells, err := parser.ParseLispTuple[*cell.Cell](r.AsTuple())
		if err != nil {
			return nil, fmt.Errorf("error parsing lisp tuple: %w", err)
		}

		if len(cells) == 0 {
			return []common.CrossChainAddress{}, nil
		}

		addrs := make([]common.CrossChainAddress, 0, len(cells))
		for i, c := range cells {
			addr, err := loadCrossChainAddressFromCell(c)
			if err != nil {
				return nil, fmt.Errorf("error loading CrossChainAddress at index %d: %w", i, err)
			}
			addrs = append(addrs, addr)
		}

		return addrs, nil
	}),
}

// GetTokenTransferFeeConfigResult holds the optional fee config result.
type GetTokenTransferFeeConfigResult struct {
	IsFound bool
	Config  TokenTransferFeeConfig
}

// GetTokenTransferFeeConfig gets the token transfer fee config for a destination chain.
//
// On-chain: fun TokenPool<T>.getTokenTransferFeeConfig(self, destChainSelector: uint64): TokenPool_TokenTransferFeeConfig?
var GetTokenTransferFeeConfig = tvm.Getter[uint64, GetTokenTransferFeeConfigResult]{
	Name: "getTokenTransferFeeConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (GetTokenTransferFeeConfigResult, error) {
		// Check if result is null (config not found)
		isNil, err := r.IsNil(0)
		if err != nil {
			return GetTokenTransferFeeConfigResult{}, fmt.Errorf("error checking IsNil(0): %w", err)
		}
		if isNil {
			return GetTokenTransferFeeConfigResult{IsFound: false}, nil
		}

		// Load the config from the cell
		c, err := r.Cell(0)
		if err != nil {
			return GetTokenTransferFeeConfigResult{}, fmt.Errorf("error getting Cell(0): %w", err)
		}

		var cfg TokenTransferFeeConfig
		if err := tlb.LoadFromCell(&cfg, c.BeginParse()); err != nil {
			return GetTokenTransferFeeConfigResult{}, fmt.Errorf("error decoding TokenTransferFeeConfig: %w", err)
		}

		return GetTokenTransferFeeConfigResult{
			IsFound: true,
			Config:  cfg,
		}, nil
	}),
}

// GetCurrentRateLimiterState gets the outbound and inbound rate limiter state for the given
// remote chain at the time of the call.
//
// On-chain: get fun getCurrentRateLimiterState(remoteChainSelector: uint64, fastFinality: bool): TokenPool_RateLimiterPair
var GetCurrentRateLimiterState = tvm.Getter[GetCurrentRateLimiterStateArgs, RateLimiterPair]{
	Name: "getCurrentRateLimiterState",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (RateLimiterPair, error) {
		c, err := r.Cell(0)
		if err != nil {
			return RateLimiterPair{}, fmt.Errorf("error getting Cell(0) - rateLimiterPair: %w", err)
		}

		var pair RateLimiterPair
		if err := tlb.LoadFromCell(&pair, c.BeginParse()); err != nil {
			return RateLimiterPair{}, fmt.Errorf("error decoding RateLimiterPair: %w", err)
		}

		return pair, nil
	}),
}

// GetCurrentRateLimiterStateArgs holds the arguments for getCurrentRateLimiterState.
type GetCurrentRateLimiterStateArgs struct {
	RemoteChainSelector uint64
	FastFinality        bool
}

// --- Helper: load CrossChainAddress from a cell (as returned by getRemoteToken) ---
// NOTE: The on-chain getter returns a Cell<CrossChainAddress> where the cross-chain
// address is stored as a slice with a length prefix followed by the address bytes.
// We handle both cases: cell directly beginparseable and cell references.

// --- Helper: parse lisp_list of CrossChainAddress (used by getRemotePools) ---
// The on-chain lisp_list is encoded as a nested tuple structure where each element
// is a CrossChainAddress (loaded as a cell/slice).

// --- Convenience getters ---

// GetCursedSubjects gets all cursed subjects.
//
// On-chain: The cursed subjects dict is returned as a lisp list of uint128 keys.
var GetCursedSubjects = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]*big.Int]{
	Name: "cursedSubjects",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]*big.Int, error) {
		return parser.ParseLispTuple[*big.Int](r.AsTuple())
	}),
})

// GetAdminConfig gets the full admin configuration.
//
// On-chain: fun TokenPool<T>.getAdminConfig(self): TokenPool_AdminConfig
var GetAdminConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[AdminConfig]{
	Name: "getAdminConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (AdminConfig, error) {
		c, err := r.Cell(0)
		if err != nil {
			return AdminConfig{}, fmt.Errorf("error getting Cell(0) - adminConfig: %w", err)
		}

		var cfg AdminConfig
		if err := tlb.LoadFromCell(&cfg, c.BeginParse()); err != nil {
			return AdminConfig{}, fmt.Errorf("error decoding AdminConfig: %w", err)
		}

		return cfg, nil
	}),
})

// GetMirroredPolicy gets the mirrored policy (onRamps, offRamps, cursedSubjects).
//
// On-chain: fun TokenPool<T>.getMirroredPolicy(self): TokenPool_MirroredPolicy
var GetMirroredPolicy = tvm.NewNoArgsGetter(tvm.NoArgsOpts[MirroredPolicy]{
	Name: "getMirroredPolicy",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (MirroredPolicy, error) {
		c, err := r.Cell(0)
		if err != nil {
			return MirroredPolicy{}, fmt.Errorf("error getting Cell(0) - mirroredPolicy: %w", err)
		}

		var mp MirroredPolicy
		if err := tlb.LoadFromCell(&mp, c.BeginParse()); err != nil {
			return MirroredPolicy{}, fmt.Errorf("error decoding MirroredPolicy: %w", err)
		}

		return mp, nil
	}),
})

// GetRemoteChainConfig gets the remote chain config for a given chain selector.
//
// On-chain: fun TokenPool<T>.getRemoteChainConfig(self, remoteChainSelector: uint64): TokenPool_RemoteChainConfig?
var GetRemoteChainConfig = tvm.Getter[uint64, GetRemoteChainConfigResult]{
	Name: "getRemoteChainConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (GetRemoteChainConfigResult, error) {
		// Check if result is null (config not found)
		isNil, err := r.IsNil(0)
		if err != nil {
			return GetRemoteChainConfigResult{}, fmt.Errorf("error checking IsNil(0): %w", err)
		}
		if isNil {
			return GetRemoteChainConfigResult{IsFound: false}, nil
		}

		c, err := r.Cell(0)
		if err != nil {
			return GetRemoteChainConfigResult{}, fmt.Errorf("error getting Cell(0): %w", err)
		}

		var cfg RemoteChainConfig
		if err := tlb.LoadFromCell(&cfg, c.BeginParse()); err != nil {
			return GetRemoteChainConfigResult{}, fmt.Errorf("error decoding RemoteChainConfig: %w", err)
		}

		return GetRemoteChainConfigResult{
			IsFound: true,
			Config:  cfg,
		}, nil
	}),
}

// GetRemoteChainConfigResult holds the optional remote chain config result.
type GetRemoteChainConfigResult struct {
	IsFound bool
	Config  RemoteChainConfig
}

// --- Internal helpers ---

// loadCrossChainAddressFromCell loads a CrossChainAddress from a cell.
func loadCrossChainAddressFromCell(c *cell.Cell) (common.CrossChainAddress, error) {
	if c == nil {
		return nil, errors.New("nil cell")
	}

	cs := c.BeginParse()
	return common.LoadCrossChainAddressWithoutPrefix(cs)
}

// --- GetFee getters (matching EVM spec) ---

// GetFeeArgs holds the arguments for the getFee getter.
type GetFeeArgs struct {
	LocalToken              *address.Address
	DestChainSelector       uint64
	Amount                  *big.Int
	FeeToken                *address.Address
	RequestedFinalityConfig uint32
	TokenArgs               *cell.Cell
}

// GetFeeResult holds the result of the getFee getter.
type GetFeeResult struct {
	FeeUSDCents       *big.Int
	DestGasOverhead   uint32
	DestBytesOverhead uint32
	TokenFeeBps       uint16
	IsEnabled         bool
}

// GetFee gets the pool fee parameters that will apply to a transfer.
//
// On-chain: fun TokenPool<T>.getFee(self, _localToken: address, destChainSelector: uint64, _amount: uint256, _feeToken: address, requestedFinalityConfig: uint32, _tokenArgs: cell?): (uint256, uint32, uint32, uint16, bool)
var GetFee = tvm.Getter[GetFeeArgs, GetFeeResult]{
	Name: "getFee",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (GetFeeResult, error) {
		feeUSDCents, err := r.Int(0)
		if err != nil {
			return GetFeeResult{}, fmt.Errorf("error getting Int(0) - feeUSDCents: %w", err)
		}

		destGasOverheadVal, err := r.Int(1)
		if err != nil {
			return GetFeeResult{}, fmt.Errorf("error getting Int(1) - destGasOverhead: %w", err)
		}

		destBytesOverheadVal, err := r.Int(2)
		if err != nil {
			return GetFeeResult{}, fmt.Errorf("error getting Int(2) - destBytesOverhead: %w", err)
		}

		tokenFeeBpsVal, err := r.Int(3)
		if err != nil {
			return GetFeeResult{}, fmt.Errorf("error getting Int(3) - tokenFeeBps: %w", err)
		}

		enabledVal, err := r.Int(4)
		if err != nil {
			return GetFeeResult{}, fmt.Errorf("error getting Int(4) - isEnabled: %w", err)
		}

		return GetFeeResult{
			FeeUSDCents:       feeUSDCents,
			DestGasOverhead:   uint32(destGasOverheadVal.Uint64()),
			DestBytesOverhead: uint32(destBytesOverheadVal.Uint64()),
			TokenFeeBps:       uint16(tokenFeeBpsVal.Uint64()),
			IsEnabled:         enabledVal.Cmp(big.NewInt(0)) != 0,
		}, nil
	}),
}
