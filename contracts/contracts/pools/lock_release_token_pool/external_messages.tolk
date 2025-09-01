tolk 1.0

// Event
//crc32("LockReleaseTokenPool_RebalancerSet")
const LOCK_RELEASE_TOKEN_POOL_REBALANCER_SET_TOPIC: int = stringCrc32("LockReleaseTokenPool_RebalancerSet");
struct LockReleaseTokenPool_RebalancerSet {
    oldRebalancer: address
    newRebalancer: address
}

// Event
//crc32("LockReleaseTokenPool_LiquidityAdded")
const LOCK_RELEASE_TOKEN_POOL_LIQUIDITY_ADDED_TOPIC: int = stringCrc32("LockReleaseTokenPool_LiquidityAdded");
struct LockReleaseTokenPool_LiquidityAdded {
    provider: address
    amount: uint256
}

// Event
//crc32("LockReleaseTokenPool_LiquidityRemoved")
const LOCK_RELEASE_TOKEN_POOL_LIQUIDITY_REMOVED_TOPIC: int = stringCrc32("LockReleaseTokenPool_LiquidityRemoved");
struct LockReleaseTokenPool_LiquidityRemoved {
    provider: address
    amount: uint256
}

// Event
//crc32("LockReleaseTokenPool_LiquidityTransferred")
const LOCK_RELEASE_TOKEN_POOL_LIQUIDITY_TRANSFERRED_TOPIC: int = stringCrc32("LockReleaseTokenPool_LiquidityTransferred");
struct LockReleaseTokenPool_LiquidityTransferred {
    from: address
    amount: uint256
}