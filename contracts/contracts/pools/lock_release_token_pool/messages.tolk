tolk 1.0

import "../../lib/pools/pool"
import "../../lib/pools/ipool"

// --- Messages - incoming ---
/// @notice Gets rebalancer address
struct (0x1a2b3c4d) LockReleaseTokenPool_GetRebalancer {
    queryId: uint64
}

/// @notice Sets the rebalancer address.
/// @dev Address(0) can be used to disable the rebalancer.
/// @dev Only callable by the owner.
struct (0x2b3c4d5e) LockReleaseTokenPool_SetRebalancer {
    queryId: uint64
    rebalancer: address
}

/// @notice Adds liquidity to the pool. The tokens should be approved first.
/// @param amount The amount of liquidity to provide.
struct (0x3c4d5e6f) LockReleaseTokenPool_ProvideLiquidity {
    queryId: uint64
    amount: uint256
}

/// @notice Removed liquidity to the pool. The tokens will be sent to msg.sender.
/// @param amount The amount of liquidity to remove.
struct (0x4d5e6f70) LockReleaseTokenPool_WithdrawLiquidity {
    queryId: uint64
    amount: uint256
}

/// @notice Transfer liquidity from an older version of the pool to this pool.
/// @param from The address of the old pool.
/// @param amount The amount of liquidity to transfer. If uint256.max is passed, all liquidity will be transferred.
struct (0x5e6f7081) LockReleaseTokenPool_TransferLiquidity {
    queryId: uint64
    from: address
    amount: uint256
}

/// @dev Union of all incoming messages.
type LockReleaseTokenPool_InMessage =
    | Pool_LockOrBurnInV1
    | Pool_ReleaseOrMintInV1
    | LockReleaseTokenPool_GetRebalancer
    | LockReleaseTokenPool_SetRebalancer
    // | LockReleaseTokenPool_ProvideLiquidity
    // | LockReleaseTokenPool_WithdrawLiquidity
    // | LockReleaseTokenPool_TransferLiquidity

// --- Messages - outgoing ---
/// @notice Response for GetRebalancer query
struct (0xa1b2c3d4) LockReleaseTokenPool_GetRebalancerResponse {
    queryId: uint64
    rebalancer: address
}

/// @notice Confirmation for SetRebalancer operation
struct (0xb2c3d4e5) LockReleaseTokenPool_SetRebalancerResponse {
    queryId: uint64
}

/// @notice Confirmation for ProvideLiquidity operation
struct (0xc3d4e5f6) LockReleaseTokenPool_ProvideLiquidityResponse {
    queryId: uint64
}

/// @notice Confirmation for WithdrawLiquidity operation
struct (0xd4e5f607) LockReleaseTokenPool_WithdrawLiquidityResponse {
    queryId: uint64
}

/// @notice Confirmation for TransferLiquidity operation
struct (0xe5f60718) LockReleaseTokenPool_TransferLiquidityResponse {
    queryId: uint64
}

type LockReleaseTokenPool_Response =
    | Pool_LockOrBurnOutV1
    | Pool_ReleaseOrMintOutV1
    | LockReleaseTokenPool_GetRebalancerResponse
    | LockReleaseTokenPool_SetRebalancerResponse
    | LockReleaseTokenPool_ProvideLiquidityResponse
    | LockReleaseTokenPool_WithdrawLiquidityResponse
    | LockReleaseTokenPool_TransferLiquidityResponse