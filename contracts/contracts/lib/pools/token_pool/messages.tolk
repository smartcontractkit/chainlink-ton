tolk 1.0
import "../pool"
import "../rate_limiter"
import "../../../ccip/types"
import "../../utils"

struct ChainUpdate {
    remoteChainSelector: uint64 // Remote chain selector
    remotePoolAddresses: Iterator<CrossChainAddress> // address of the remote pool, ABI encoded in the case of a remote EVM chain.
    remoteTokenAddress: CrossChainAddress // address of the remote token, ABI encoded in the case of a remote EVM chain.
    outboundRateLimiterConfig: RateLimiter_Config // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain
    inboundRateLimiterConfig: RateLimiter_Config // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain
}

/// @dev Union of all incoming messages for TokenPool<T>.
type TokenPool_InMessage =
    | TokenPool_IsSupportedToken
    | TokenPool_GetToken
    | TokenPool_GetRmnProxy
    | TokenPool_GetRouter
    | TokenPool_SetRouter
    // | TokenPool_SupportsInterface // TODO dont know if we even need this
    | TokenPool_GetTokenDecimals
    | TokenPool_GetRemotePools
    | TokenPool_IsRemotePool
    | TokenPool_GetRemoteToken
    | TokenPool_AddRemotePool
    | TokenPool_RemoveRemotePool
    | TokenPool_IsSupportedChain
    | TokenPool_GetSupportedChains
    | TokenPool_ApplyChainUpdates
    | TokenPool_SetRateLimitAdmin
    | TokenPool_GetRateLimitAdmin
    | TokenPool_GetCurrentOutboundRateLimiterState
    | TokenPool_GetCurrentInboundRateLimiterState
    | TokenPool_GetAllowListEnabled
    | TokenPool_GetAllowList
    | TokenPool_ApplyAllowListUpdates
    
// --- Messages - incoming ---
/// @notice Check if token is supported
struct (0x11223344) TokenPool_IsSupportedToken {
    queryId: uint64
    token: address
}

/// @notice Get the token managed by this pool
struct (0x22334455) TokenPool_GetToken {
    queryId: uint64
}

/// @notice Get RMN proxy address
struct (0x33445566) TokenPool_GetRmnProxy {
    queryId: uint64
}

/// @notice Get the router address
struct (0x44556677) TokenPool_GetRouter {
    queryId: uint64
}

/// @notice Set the router address
struct (0x55667788) TokenPool_SetRouter {
    queryId: uint64
    newRouter: address
}

// TODO dont know if we even need this
/// @notice Check interface support
// struct (0x66778899) TokenPool_SupportsInterface {
//     queryId: uint64
//     interfaceId: bytes4
// }

/// @notice Lock or burn tokens
struct (0x7788990a) TokenPool_LockOrBurn {
    queryId: uint64
    lockOrBurnIn: Pool_LockOrBurnInV1
}

/// @notice Release or mint tokens
struct (0x8899aa0b) TokenPool_ReleaseOrMint {
    queryId: uint64
    releaseOrMintIn: Pool_ReleaseOrMintInV1
}

/// @notice Get token decimals
struct (0x99aabb0c) TokenPool_GetTokenDecimals {
    queryId: uint64
}

/// @notice Get remote pools for a chain
struct (0xaabbcc0d) TokenPool_GetRemotePools {
    queryId: uint64
    remoteChainSelector: uint64
}

/// @notice Check if remote pool is valid
struct (0xbbccdd0e) TokenPool_IsRemotePool {
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

/// @notice Get remote token address
struct (0xccddee0f) TokenPool_GetRemoteToken {
    queryId: uint64
    remoteChainSelector: uint64
}

/// @notice Add remote pool
struct (0xddeeff10) TokenPool_AddRemotePool {
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

/// @notice Remove remote pool
struct (0xeeff0011) TokenPool_RemoveRemotePool {
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

/// @notice Check if chain is supported
struct (0xff001122) TokenPool_IsSupportedChain {
    queryId: uint64
    remoteChainSelector: uint64
}

/// @notice Get all supported chains
struct (0x00112233) TokenPool_GetSupportedChains {
    queryId: uint64
}

/// @notice Apply chain configuration updates
struct (0x11223355) TokenPool_ApplyChainUpdates {
    queryId: uint64
    chainUpdates: cell // Array of ChainUpdate
}

/// @notice Set rate limit admin
struct (0x22334466) TokenPool_SetRateLimitAdmin {
    queryId: uint64
    rateLimitAdmin: address
}

/// @notice Get rate limit admin
struct (0x33445577) TokenPool_GetRateLimitAdmin {
    queryId: uint64
}

/// @notice Get current outbound rate limiter state
struct (0x44556688) TokenPool_GetCurrentOutboundRateLimiterState {
    queryId: uint64
    remoteChainSelector: uint64
}

/// @notice Get current inbound rate limiter state
struct (0x55667799) TokenPool_GetCurrentInboundRateLimiterState {
    queryId: uint64
    remoteChainSelector: uint64
}

/// @notice Check if allow list is enabled
struct (0x667788aa) TokenPool_GetAllowListEnabled {
    queryId: uint64
}

/// @notice Get allow list
struct (0x778899bb) TokenPool_GetAllowList {
    queryId: uint64
}

/// @notice Apply allow list updates
struct (0x8899aacc) TokenPool_ApplyAllowListUpdates {
    queryId: uint64
    removes: cell // Array of addresses to remove
    adds: cell // Array of addresses to add
}

type TokenPool_Response = TokenPool_IsSupportedTokenResponse
    | TokenPool_GetTokenResponse
    | TokenPool_GetRouterResponse
    | TokenPool_SetRouterResponse
    // | TokenPool_SupportsInterfaceResponse // TODO dont know if we even need this
    | TokenPool_LockOrBurnResponse
    | TokenPool_ReleaseOrMintResponse
    | TokenPool_GetRmnProxyResponse
    | TokenPool_GetTokenDecimalsResponse
    | TokenPool_GetRemotePoolsResponse
    | TokenPool_IsRemotePoolResponse
    | TokenPool_GetRemoteTokenResponse
    | TokenPool_AddRemotePoolResponse
    | TokenPool_RemoveRemotePoolResponse
    | TokenPool_IsSupportedChainResponse
    | TokenPool_GetSupportedChainsResponse
    | TokenPool_ApplyChainUpdatesResponse
    | TokenPool_SetRateLimitAdminResponse
    | TokenPool_GetRateLimitAdminResponse
    | TokenPool_GetCurrentOutboundRateLimiterStateResponse
    | TokenPool_GetCurrentInboundRateLimiterStateResponse
    | TokenPool_GetAllowListEnabledResponse
    | TokenPool_GetAllowListResponse
    | TokenPool_ApplyAllowListUpdatesResponse

// --- Messages - outgoing ---
/// @notice Response for IsSupportedToken query
struct (0xa1a2a3a4) TokenPool_IsSupportedTokenResponse {
    queryId: uint64
    isSupported: bool
}

/// @notice Response for GetToken query
struct (0xa2a3a4a5) TokenPool_GetTokenResponse {
    queryId: uint64
    token: address
}

/// @notice Response for GetRmnProxy query
struct (0xa3a4a5a6) TokenPool_GetRmnProxyResponse {
    queryId: uint64
    rmnProxy: address
}

/// @notice Response for GetRouter query
struct (0xa4a5a6a7) TokenPool_GetRouterResponse {
    queryId: uint64
    router: address
}

/// @notice Response for SetRouter operation
struct (0xa5a6a7a8) TokenPool_SetRouterResponse {
    queryId: uint64
}

// TODO dont know if we even need this
/// @notice Response for SupportsInterface query
// struct (0xa6a7a8a9) TokenPool_SupportsInterfaceResponse {
//     queryId: uint64
//     supported: bool
// }

/// @notice Response for LockOrBurn operation
struct (0xa7a8a9aa) TokenPool_LockOrBurnResponse {
    queryId: uint64
    result: Pool_LockOrBurnOutV1
}

/// @notice Response for ReleaseOrMint operation
struct (0xa8a9aabb) TokenPool_ReleaseOrMintResponse {
    queryId: uint64
    result: Pool_ReleaseOrMintOutV1
}

/// @notice Response for GetTokenDecimals query
struct (0xa9aabbcc) TokenPool_GetTokenDecimalsResponse {
    queryId: uint64
    decimals: uint8
}

/// @notice Response for GetRemotePools query
struct (0xaabbccdd) TokenPool_GetRemotePoolsResponse {
    queryId: uint64
    remotePools: UMap<uint256, uint256>
}

/// @notice Response for IsRemotePool query
struct (0xabbccdee) TokenPool_IsRemotePoolResponse {
    queryId: uint64
    isRemotePool: bool
}

/// @notice Response for GetRemoteToken query
struct (0xbccddeef) TokenPool_GetRemoteTokenResponse {
    queryId: uint64
    remoteToken: CrossChainAddress
}

/// @notice Response for AddRemotePool operation
struct (0xcddeeffe) TokenPool_AddRemotePoolResponse {
    queryId: uint64
    success: bool
}

/// @notice Response for RemoveRemotePool operation
struct (0xddeeffff) TokenPool_RemoveRemotePoolResponse {
    queryId: uint64
    success: bool
}

/// @notice Response for IsSupportedChain query
struct (0xeeff0000) TokenPool_IsSupportedChainResponse {
    queryId: uint64
    isSupported: bool
}

/// @notice Response for GetSupportedChains query
struct (0xff000011) TokenPool_GetSupportedChainsResponse {
    queryId: uint64
    supportedChains: UMap<uint64, uint64>
}

/// @notice Response for ApplyChainUpdates operation
struct (0x00001122) TokenPool_ApplyChainUpdatesResponse {
    queryId: uint64
    success: bool
}

/// @notice Response for SetRateLimitAdmin operation
struct (0x00112233) TokenPool_SetRateLimitAdminResponse {
    queryId: uint64
    success: bool
}

/// @notice Response for GetRateLimitAdmin query
struct (0x01122334) TokenPool_GetRateLimitAdminResponse {
    queryId: uint64
    rateLimitAdmin: address
}

/// @notice Response for GetCurrentOutboundRateLimiterState query
struct (0x02233445) TokenPool_GetCurrentOutboundRateLimiterStateResponse {
    queryId: uint64
    state: RateLimiter_TokenBucket
}

/// @notice Response for GetCurrentInboundRateLimiterState query
struct (0x03344556) TokenPool_GetCurrentInboundRateLimiterStateResponse {
    queryId: uint64
    state: RateLimiter_TokenBucket
}

/// @notice Response for GetAllowListEnabled query
struct (0x04455667) TokenPool_GetAllowListEnabledResponse {
    queryId: uint64
    enabled: bool
}

/// @notice Response for GetAllowList query
struct (0x05566778) TokenPool_GetAllowListResponse {
    queryId: uint64
    allowList: Map<bool>
}

/// @notice Response for ApplyAllowListUpdates operation
struct (0x06677889) TokenPool_ApplyAllowListUpdatesResponse {
    queryId: uint64
    success: bool
}
