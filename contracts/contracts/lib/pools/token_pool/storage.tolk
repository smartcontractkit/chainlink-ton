tolk 1.0

import "../pool"
import "../rate_limiter"
import "../../jetton/jetton_client"
import "../../utils"
import "../../../ccip/types"


struct RemoteChainConfig {
    outboundRateLimiterConfig: RateLimiter_TokenBucket // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain
    inboundRateLimiterConfig: RateLimiter_TokenBucket // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain
    remoteTokenAddress: Cell<CrossChainAddress> // address of the remote token, ABI encoded in the case of a remote EVM chain.
    remotePools: UMap<uint256, uint256> // vec<256>  // Set of remote pool hashes, ABI encoded in the case of a remote EVM chain. // Original implementation uses bytes32 but in tolk keccak returns 256
}


struct TokenPool_Data {
    /// @dev The bridgeable token that is managed by this pool. Pools could support multiple tokens at the same time if
    /// required, but this implementation only supports one token.
    i_token: Cell<JettonClient>,
    /// @dev The number of decimals of the token managed by this pool.
    i_tokenDecimals: uint8
    /// @dev The address of the RMN proxy
    //  i_rmnProxy: address 
    /// @dev The immutable flag that indicates if the pool is access-controlled.
    i_allowlistEnabled: bool
    /// @dev A set of addresses allowed to trigger lockOrBurn as original senders.
    /// Only takes effect if i_allowlistEnabled is true.
    /// This can be used to ensure only token-issuer specified addresses can move tokens.
    s_allowlist: Map<bool>
    /// @dev The address of the router
    s_router: address
    /// @dev A set of allowed chain selectors. We want the allowlist to be enumerable to
    /// be able to quickly determine (without parsing logs) who can access the pool.
    /// @dev The chain selectors are in uint256 format because of the EnumerableSet implementation.
    s_remoteChainSelectors: UMap<uint64, uint64>
    // mapping(uint64 remoteChainSelector => RemoteChainConfig) internal s_remoteChainConfigs
    s_remoteChainConfigs: UMap<uint64, RemoteChainConfig>
    /// @notice A mapping of hashed pool addresses to their unhashed form. This is used to be able to find the actually
    /// configured pools and not just their hashed versions.
    // mapping(bytes32 poolAddressHash => bytes poolAddress) internal s_remotePoolAddresses
    s_remotePoolAddresses: UMap<uint256, CrossChainAddress>
    /// @notice The address of the rate limiter admin.
    /// @dev Can be address(0) if none is configured.
    s_rateLimitAdmin: address // TBD use owner instead?
}

/// Load from cell using auto-serialization.
fun TokenPool_Data.fromCell(data: cell): TokenPool_Data {
    return TokenPool_Data.fromCell(data);
}

/// Store as cell using auto-serialization.
@inline
fun TokenPool_Data.asCell(self): cell {
    return self.toCell();
}