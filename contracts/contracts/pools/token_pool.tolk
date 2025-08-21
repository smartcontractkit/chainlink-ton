// import {IERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.tolk"
// import {IERC20Metadata} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/extensions/IERC20Metadata.tolk"
// import {IERC165} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/introspection/IERC165.tolk"
// import {EnumerableSet} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/structs/EnumerableSet.sol";
import "@stdlib/tvm-dicts"
import "../ccip/types"
import "../lib/access/ownable_2step.tolk"
// import {IPoolV1} from "../interfaces/IPool.tolk"
// import {IRMN} from "../interfaces/IRMN.tolk"
// import {IRouter} from "../interfaces/IRouter.tolk"
import "../lib/pools/pool.tolk"
import "../lib/pools/rate_limiter.tolk"
import "../lib/utils"
import "../../ccip/types"

tolk 1.0

const ERROR_CALLER_IS_NOT_A_RAMP_ON_ROUTER = 1001
struct ErrorCallerIsNotARampOnRouter{caller: address };
const ERROR_ZERO_ADDRESS_INVALID = 1002
struct ErrorZeroAddressInvalid{};
const ERROR_SENDER_NOT_ALLOWED = 1003
struct ErrorSenderNotAllowed{sender: address };
const ERROR_ALLOW_LIST_NOT_ENABLED = 1004
struct ErrorAllowListNotEnabled{};
const ERROR_NON_EXISTENT_CHAIN = 1005
struct ErrorNonExistentChain{remoteChainSelector: uint64 };
const ERROR_CHAIN_NOT_ALLOWED = 1006
struct ErrorChainNotAllowed{remoteChainSelector: uint64 };
const ERROR_CURSED_BY_RMN = 1007
struct ErrorCursedByRMN{};
const ERROR_CHAIN_ALREADY_EXISTS = 1008
struct ErrorChainAlreadyExists{chainSelector: uint64 };
const ERROR_INVALID_SOURCE_POOL_ADDRESS = 1009
struct ErrorInvalidSourcePoolAddress{sourcePoolAddress: CrossChainAddress };
const ERROR_INVALID_TOKEN = 1010
struct ErrorInvalidToken{token: address };
const ERROR_UNAUTHORIZED = 1011
struct ErrorUnauthorized{caller: address };
const ERROR_POOL_ALREADY_ADDED = 1012
struct ErrorPoolAlreadyAdded{remoteChainSelector: uint64, remotePoolAddress: CrossChainAddress};
const ERROR_INVALID_REMOTE_POOL_FOR_CHAIN = 1013
struct ErrorInvalidRemotePoolForChain{remoteChainSelector: uint64, remotePoolAddress: CrossChainAddress};
const ERROR_INVALID_REMOTE_CHAIN_DECIMALS = 1014
struct ErrorInvalidRemoteChainDecimals{sourcePoolData: slice};
const ERROR_MISMATCHED_ARRAY_LENGTHS = 1015
struct ErrorMismatchedArrayLengths{};
const ERROR_OVERFLOW_DETECTED = 1016
struct ErrorOverflowDetected{remoteDecimals: uint8, localDecimals: uint8, remoteAmount: uint256};
const ERROR_INVALID_DECIMAL_ARGS = 1017
struct ErrorInvalidDecimalArgs{expected: uint8, actual: uint8};

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

/// @notice Check interface support
struct (0x66778899) TokenPool_SupportsInterface {
    queryId: uint64
    interfaceId: bytes4
}

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
    remotePoolAddress: slice
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

/// @dev Union of all incoming messages for TokenPool<T>.
type TokenPool_InMessage =
    | TokenPool_IsSupportedToken
    | TokenPool_GetToken
    | TokenPool_GetRmnProxy
    | TokenPool_GetRouter
    | TokenPool_SetRouter
    | TokenPool_SupportsInterface
    | TokenPool_LockOrBurn
    | TokenPool_ReleaseOrMint
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

// --- Messages - outgoing ---
/// @notice Response for IsSupportedToken query
struct (0xa1a2a3a4) TokenPool_IsSupportedTokenResponse {
    queryId: uint64
    isSupported: bool
}

/// @notice Response for GetToken query
struct (0xa2a3a4a5) TokenPool_GetTokenResponse {
    queryId: uint64
    token: IERC20
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
    err: Cell?
}

/// @notice Response for SupportsInterface query
struct (0xa6a7a8a9) TokenPool_SupportsInterfaceResponse {
    queryId: uint64
    supported: bool
}

/// @notice Response for LockOrBurn operation
struct (0xa7a8a9aa) TokenPool_LockOrBurnResponse {
    queryId: uint64
    result: Pool_LockOrBurnOutV1?
    err: 
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
    remotePools: slice
}

/// @notice Response for IsRemotePool query
struct (0xabbccdee) TokenPool_IsRemotePoolResponse {
    queryId: uint64
    isRemotePool: bool
}

/// @notice Response for GetRemoteToken query
struct (0xbccddeef) TokenPool_GetRemoteTokenResponse {
    queryId: uint64
    remoteToken: slice
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
    supportedChains: tuple
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
    allowList: tuple
}

/// @notice Response for ApplyAllowListUpdates operation
struct (0x06677889) TokenPool_ApplyAllowListUpdatesResponse {
    queryId: uint64
    success: bool
}

/// @notice Base abstract class with common functions for all token pools.
/// A token pool serves as isolated place for holding tokens and token specific logic
/// that may execute as tokens move across the bridge.
/// @dev This pool supports different decimals on different chains but using this feature could impact the total number
/// of tokens in circulation. Since all of the tokens are locked/burned on the source, and a rounded amount is
/// minted/released on the destination, the number of tokens minted/released could be less than the number of tokens
/// burned/locked. This is because the source chain does not know about the destination token decimals. This is not a
/// problem if the decimals are the same on both chains.
///
/// Example:
/// Assume there is a token with 6 decimals on chain A and 3 decimals on chain B.
/// - 1.234567 tokens are burned on chain A.
/// - 1.234    tokens are minted on chain B.
/// When sending the 1.234 tokens back to chain A, you will receive 1.234000 tokens on chain A, effectively losing
/// 0.000567 tokens.
/// In the case of a burnMint pool on chain A, these funds are burned in the pool on chain A.
/// In the case of a lockRelease pool on chain A, these funds accumulate in the pool on chain A.
struct TokenPool_LockedOrBurned {
    remoteChainSelector: uint64
    token: address
    sender: address
    amount: uint256
}

// TBD it is questionable that this types are in the common token pool while they are only used by their respective implementations
struct TokenPool_ReleasedOrMinted {
    remoteChainSelector: uint64
    token: address
    sender: address
    recipient: address
    amount: uint256
}
struct TokenPool_ChainAdded {
    remoteChainSelector: uint64
    remoteToken: CrossChainAddress
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}
struct TokenPool_ChainConfigured {
    remoteChainSelector: uint64
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}
struct TokenPool_ChainRemoved {
    remoteChainSelector: uint64
}
struct TokenPool_RemotePoolAdded {
    remoteChainSelector: uint64
    remotePoolAddress: bytes
}
struct TokenPool_RemotePoolRemoved {
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}
struct TokenPool_AllowListAdd {
    sender: address
}
struct TokenPool_AllowListRemove {
    sender: address
}
struct TokenPool_RouterUpdated {
    oldRouter: address
    newRouter: address
}
struct TokenPool_RateLimitAdminSet {
    rateLimitAdmin: address
}
struct TokenPool_OutboundRateLimitConsumed {
    remoteChainSelector: uint64
    token: address
    amount: uint256
}
struct TokenPool_InboundRateLimitConsumed {
    remoteChainSelector: uint64
    token: address
    amount: uint256
}

struct ChainUpdate {
    remoteChainSelector: uint64 // Remote chain selector
    remotePoolAddresses: Iterator<CrossChainAddress> // Address of the remote pool, ABI encoded in the case of a remote EVM chain.
    remoteTokenAddress: slice // Address of the remote token, ABI encoded in the case of a remote EVM chain.
    outboundRateLimiterConfig: RateLimiter_Config // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain
    inboundRateLimiterConfig: RateLimiter_Config // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain
}

struct RemoteChainConfig {
    outboundRateLimiterConfig: RateLimiter_TokenBucket // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain
    inboundRateLimiterConfig: RateLimiter_TokenBucket // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain
    remoteTokenAddress: bytes // Address of the remote token, ABI encoded in the case of a remote EVM chain.
    remotePools: cell // vec<256>  // Set of remote pool hashes, ABI encoded in the case of a remote EVM chain.
}

/// @dev TokenPool contract struct with optional hooks for virtual functions
struct TokenPool<T> {
    data: TokenPool_Data
    /// Runtime hooks (extensions)
    context: T? = null
    hooks: TokenPool_Hooks<T>? = null
}

struct TokenPool_Data {
    /// ID allows multiple independent instances, since contract address depends on initial state.
    id: uint32
    /// Ownable trait data
    ownable: Ownable2Step
    /// @dev The bridgeable token that is managed by this pool. Pools could support multiple tokens at the same time if
    /// required, but this implementation only supports one token.
    i_token: IERC20
    /// @dev The number of decimals of the token managed by this pool.
    i_tokenDecimals: uint8
    /// @dev The address of the RMN proxy
    //  i_rmnProxy: address 
    /// @dev The immutable flag that indicates if the pool is access-controlled.
    i_allowlistEnabled: bool
    /// @dev A set of addresses allowed to trigger lockOrBurn as original senders.
    /// Only takes effect if i_allowlistEnabled is true.
    /// This can be used to ensure only token-issuer specified addresses can move tokens.
    s_allowlist: cell
    /// @dev The address of the router
    //  s_router:   IRouter
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
    s_remotePoolAddresses: UMap<bytes32, slice>
    /// @notice The address of the rate limiter admin.
    /// @dev Can be address(0) if none is configured.
    s_rateLimitAdmin: address // TBD use owner instead?
}

/// Load from cell using auto-serialization.
fun TokenPool_Data.fromCell(data: Cell): MCMS_Data {
    return TokenPool_Data.fromCell(data);
}

/// Store as cell using auto-serialization.
@inline
fun MCMS_Data.asCell(self): Cell {
    return self.toCell();
}

// --- Hooks struct (extensions) ---
/// @dev Hook extensions exposed by the TokenPool contract.
struct TokenPool_Hooks<T> {
    /// Hook for _releaseOrMint virtual function
    releaseOrMint: ((T?, address, uint256) -> void)?
    /// Hook for getRouter virtual function override
    getRouter: ((T?) -> address)?
    /// Hook for getTokenDecimals virtual function override  
    getTokenDecimals: ((T?) -> uint8)?
    /// Hook for _encodeLocalDecimals virtual function override
    encodeLocalDecimals: ((T?) -> bytes)?
    /// Hook for _calculateLocalAmount virtual function override
    calculateLocalAmount: ((T?, uint256, uint8) -> uint256)?
}

// --- Methods ---
/// @dev Loads the TokenPool data from cell.
fun TokenPool<T>.load(data: Cell, context: T? = null, hooks: TokenPool_Hooks<T>? = null): TokenPool<T> {
    // Load the contract data from the persistent storage
    var data = TokenPool_Data.fromCell(data);

    // Return the TokenPool instance with loaded data and hooks
    return TokenPool<T> {
        data,
        context,
        hooks,
    };
}

// --- Message handlers ---
/// @notice Handles incoming messages for TokenPool
@inline
fun TokenPool<T>.onInternalMessage(
    mutate self,
    msgSender: address,
    _msgValue: coins,
    msgBody: slice,
): bool {
    try {
        val msg = lazy TokenPool_InMessage.fromSlice(msgBody);
        match (msg) {
            TokenPool_IsSupportedToken => {
                val response = TokenPool_IsSupportedTokenResponse {
                    queryId: msg.queryId,
                    isSupported: self.isSupportedToken(msg.token),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetToken => {
                val response = TokenPool_GetTokenResponse {
                    queryId: msg.queryId,
                    token: self.getToken(),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetRouter => {
                val response = TokenPool_GetRouterResponse {
                    queryId: msg.queryId,
                    router: self.getRouter(),
                };
                sendMessage(sender, response);
            }
            TokenPool_S: cell?etRouter => {
                val err = self.setRouter(sender, msg.newRouter);
                val response = TokenPool_SetRouterResponse { queryId: msg.queryId, err };
                sendMessage(sender, response);
            }
            TokenPool_SupportsInterface => {
                val response = TokenPool_SupportsInterfaceResponse {
                    queryId: msg.queryId,
                    supported: self.supportsInterface(msg.interfaceId),
                };
                sendMessage(sender, response);
            }
            TokenPool_LockOrBurn => {
                try {
                    val result = self.lockOrBurn(msg.lockOrBurnIn);
                    val response = TokenPool_LockOrBurnResponse { queryId: msg.queryId, result };
                    sendMessage(sender, response);
                } catch(n, err) {
                    // Send error response
                    val response = TokenPool_LockOrBurnResponse {
                        queryId: msg.queryId,
                        result: null,
                        err,
                    };
                    sendMessage(sender, response);
                }
            }
            TokenPool_ReleaseOrMint => {
                try {
                    val result = self.releaseOrMint(msg.releaseOrMintIn);
                    val response = TokenPool_ReleaseOrMintResponse { queryId: msg.queryId, result };
                    sendMessage(sender, response);
                } catch {
                    // Send error response
                    val response = TokenPool_ReleaseOrMintResponse {
                        queryId: msg.queryId,
                        result: Pool_ReleaseOrMintOutV1 { destinationAmount: 0 },
                    };
                    sendMessage(sender, response);
                }
            }
            // Add all remaining message handlers
            TokenPool_GetRmnProxy => {
                val response = TokenPool_GetRmnProxyResponse {
                    queryId: msg.queryId,
                    rmnProxy: self.getRmnProxy(),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetTokenDecimals => {
                val response = TokenPool_GetTokenDecimalsResponse {
                    queryId: msg.queryId,
                    decimals: self.getTokenDecimals(),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetRemotePools => {
                val response = TokenPool_GetRemotePoolsResponse {
                    queryId: msg.queryId,
                    remotePools: self.getRemotePools(msg.remoteChainSelector),
                };
                sendMessage(sender, response);
            }
            TokenPool_IsRemotePool => {
                val response = TokenPool_IsRemotePoolResponse {
                    queryId: msg.queryId,
                    isRemotePool: self.isRemotePool(msg.remoteChainSelector, msg.remotePoolAddress),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetRemoteToken => {
                val response = TokenPool_GetRemoteTokenResponse {
                    queryId: msg.queryId,
                    remoteToken: self.getRemoteToken(msg.remoteChainSelector),
                };
                sendMessage(sender, response);
            }
            TokenPool_AddRemotePool => {
                val success = self.addRemotePool(
                    sender,
                    msg.remoteChainSelector,
                    msg.remotePoolAddress
                );
                val response = TokenPool_AddRemotePoolResponse { queryId: msg.queryId, success };
                sendMessage(sender, response);
            }
            TokenPool_RemoveRemotePool => {
                val success = self.removeRemotePool(
                    sender,
                    msg.remoteChainSelector,
                    msg.remotePoolAddress
                );
                val response = TokenPool_RemoveRemotePoolResponse { queryId: msg.queryId, success };
                sendMessage(sender, response);
            }
            TokenPool_IsSupportedChain => {
                val response = TokenPool_IsSupportedChainResponse {
                    queryId: msg.queryId,
                    isSupported: self.isSupportedChain(msg.remoteChainSelector),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetSupportedChains => {
                val response = TokenPool_GetSupportedChainsResponse {
                    queryId: msg.queryId,
                    supportedChains: self.getSupportedChains(),
                };
                sendMessage(sender, response);
            }
            TokenPool_ApplyChainUpdates => {
                val success = self.applyChainUpdates(sender, msg.chainUpdates);
                val response = TokenPool_ApplyChainUpdatesResponse { queryId: msg.queryId, success };
                sendMessage(sender, response);
            }
            TokenPool_SetRateLimitAdmin => {
                val success = self.setRateLimitAdmin(sender, msg.rateLimitAdmin);
                val response = TokenPool_SetRateLimitAdminResponse { queryId: msg.queryId, success };
                sendMessage(sender, response);
            }
            TokenPool_GetRateLimitAdmin => {
                val response = TokenPool_GetRateLimitAdminResponse {
                    queryId: msg.queryId,
                    rateLimitAdmin: self.getRateLimitAdmin(),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetCurrentOutboundRateLimiterState => {
                val response = TokenPool_GetCurrentOutboundRateLimiterStateResponse {
                    queryId: msg.queryId,
                    state: self.getCurrentOutboundRateLimiterState(msg.remoteChainSelector),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetCurrentInboundRateLimiterState => {
                val response = TokenPool_GetCurrentInboundRateLimiterStateResponse {
                    queryId: msg.queryId,
                    state: self.getCurrentInboundRateLimiterState(msg.remoteChainSelector),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetAllowListEnabled => {
                val response = TokenPool_GetAllowListEnabledResponse {
                    queryId: msg.queryId,
                    enabled: self.getAllowListEnabled(),
                };
                sendMessage(sender, response);
            }
            TokenPool_GetAllowList => {
                val response = TokenPool_GetAllowListResponse {
                    queryId: msg.queryId,
                    allowList: self.getAllowList(),
                };
                sendMessage(sender, response);
            }
            TokenPool_ApplyAllowListUpdates => {
                val success = self.applyAllowListUpdates(sender, msg.removes, msg.adds);
                val response = TokenPool_ApplyAllowListUpdatesResponse {
                    queryId: msg.queryId,
                    success,
                };
                sendMessage(sender, response);
            }
        }
        // Unknown message type - could be handled by extension
        return true;
    } catch {
        return false; // Not a TokenPool message
    }
}

// --- Hook-aware virtual function implementations ---
/// @notice Hook-aware implementation of _releaseOrMint
fun TokenPool<T>._releaseOrMint(mutate self, receiver: address, amount: uint256) {
    if (self.hooks != null && self.hooks.releaseOrMint != null) {
        return self.hooks.releaseOrMint(self.context, receiver, amount); // extension hook
    }

    // Default implementation - to be overridden in derived contracts
    throw ERROR_UNAUTHORIZED; // Base implementation should be overridden
}

/// @notice Hook-aware implementation of getRouter  
fun TokenPool<T>.getRouter(self): address {
    if (self.hooks != null && self.hooks.getRouter != null) {
        return self.hooks.getRouter(self.context); // extension hook
    }

    return self.s_router;
}

/// @notice Hook-aware implementation of getTokenDecimals
fun TokenPool<T>.getTokenDecimals(self): uint8 {
    if (self.hooks != null && self.hooks.getTokenDecimals != null) {
        return self.hooks.getTokenDecimals(self.context); // extension hook
    }

    return self.i_tokenDecimals;
}

/// @notice Hook-aware implementation of _encodeLocalDecimals
fun TokenPool<T>._encodeLocalDecimals(self): bytes {
    if (self.hooks != null && self.hooks.encodeLocalDecimals != null) {
        return self.hooks.encodeLocalDecimals(self.context); // extension hook
    }

    return beginCell().storeUint8(self.i_tokenDecimals).endCell().asSlice();
}

/// @notice Hook-aware implementation of _calculateLocalAmount
fun TokenPool<T>._calculateLocalAmount(self, remoteAmount: uint256, remoteDecimals: uint8): uint256 {
    if (self.hooks != null && self.hooks.calculateLocalAmount != null) {
        return self.hooks.calculateLocalAmount(self.context, remoteAmount, remoteDecimals); // extension hook
    }

    return Pool.calculateLocalAmount(remoteAmount, remoteDecimals, self.i_tokenDecimals);
}

// --- Internal functions ---
/// @inheritdoc IPoolV1
fun TokenPool<T>.isSupportedToken(self, token: address): bool {
    return token == self.i_token.address;
}

/// @notice Gets the IERC20 token that this pool can lock or burn.
/// @return token The IERC20 token representation.
fun TokenPool<T>.getToken(self): IERC20 {
    return self.i_token;
}

/// @notice Get RMN proxy address
/// @return rmnProxy Address of RMN proxy
fun TokenPool<T>.getRmnProxy(self): address {
    return self.i_rmnProxy;
}

/// @notice Gets the pool's Router
/// @return router The pool's Router
fun TokenPool<T>.getRouter(self): address {
    return self.s_router;
}

/// @notice Sets the pool's Router
/// @param newRouter The new Router
fun TokenPool<T>.setRouter(mutate self, sender: address, newRouter: address): u? {
    try {
        self.ownable.requireOwner(sender);

        if (newRouter == createAddressNone()) {
            throw (ERROR_ZERO_ADDRESS_INVALID, Error_ZeroAddressInvalid {});
        }
        var oldRouter: address = self.s_router;
        self.s_router = newRouter;

        emit(TokenPool_RouterUpdated { oldRouter, newRouter });
        return null;
    } catch (n, e) {
        return e;
    }
}

/// @notice Signals which version of the pool interface is supported
fun TokenPool<T>.supportsInterface(self, interfaceId): bool {
    return interfaceId == Pool_CCIP_POOL_V1 || interfaceId == type(IPoolV1).interfaceId ||
    interfaceId == type(IERC165).interfaceId;
}

// ================================================================
// │                        Lock or Burn                          │
// ================================================================
/// @notice Burn the token in the pool
/// @dev The _validateLockOrBurn check is an essential security check
fun TokenPool<T>.lockOrBurn(mutate self, Pool_LockOrBurnInV1: lockOrBurnIn): Pool_LockOrBurnOutV1 {
    _validateLockOrBurn(lockOrBurnIn);

    _lockOrBurn(lockOrBurnIn.amount);

    emit(TokenPool_LockedOrBurned {
        remoteChainSelector: lockOrBurnIn.remoteChainSelector,
        token: self.i_token,
        sender: msg.sender,
        amount: lockOrBurnIn.amount,
    });

    return Pool_LockOrBurnOutV1 {
        destTokenAddress: getRemoteToken(lockOrBurnIn.remoteChainSelector),
        destPoolData: _encodeLocalDecimals(),
    };
}

/// @notice Contains the specific lock or burn token logic for a pool.
/// @dev overriding this method allows us to create pools with different lock/burn signatures
/// without duplicating the underlying logic.
// TODO virtual; expose as hook?
fun TokenPool<T>._lockOrBurn(mutate self, uint256) {}

// ================================================================
// │                      Release or Mint                         │
// ================================================================
/// @notice Mint tokens from the pool to the recipient
/// @dev The _validateReleaseOrMint check is an essential security check
fun TokenPool<T>.releaseOrMint(mutate self, Pool_ReleaseOrMintInV1: releaseOrMintIn): Pool_ReleaseOrMintOutV1 {
    // Calculate the local amount
    val localAmount: uint256 = _calculateLocalAmount(
        releaseOrMintIn.sourceDenominatedAmount,
        _parseRemoteDecimals(releaseOrMintIn.sourcePoolData)
    );

    _validateReleaseOrMint(releaseOrMintIn, localAmount);

    // Mint to the receiver
    _releaseOrMint(releaseOrMintIn.receiver, localAmount);

    emit(TokenPool_ReleasedOrMinted {
        remoteChainSelector: releaseOrMintIn.remoteChainSelector,
        token: self.i_token,
        sender: msg.sender,
        recipient: releaseOrMintIn.receiver,
        amount: localAmount,
    });

    return Pool_ReleaseOrMintOutV1({ destinationAmount: localAmount });
}

/// @notice Contains the specific release or mint token logic for a pool.
/// @dev overriding this method allows us to create pools with different release/mint signatures
/// without duplicating the underlying logic.
// TODO virtual; expose as hook?
fun TokenPool<T>._releaseOrMint(mutate self, receiver: address, uint256) {}

// ================================================================
// │                         Validation                           │
// ================================================================
/// @notice Validates the lock or burn input for correctness on
/// - token to be locked or burned
/// - RMN curse status
/// - allowlist status
/// - if the sender is a valid onRamp
/// - rate limit status
/// @param lockOrBurnIn The input to validate.
/// @dev This function should always be called before executing a lock or burn. Not doing so would allow
/// for various exploits.
fun TokenPool<T>._validateLockOrBurn(mutate self, lockOrBurnIn: Pool_LockOrBurnInV1) {
    if (!isSupportedToken(lockOrBurnIn.localToken)) {
        // revert InvalidToken(lockOrBurnIn.localToken) // TBD should return instead?
        throw (ERROR_INVALID_TOKEN, ErrorInvalidTocken{address: lockOrBurnIn.localToken}.toCell());
    }
    // if (IRMN(self.i_rmnProxy).isCursed(bytes16(uint128(lockOrBurnIn.remoteChainSelector)))) {
    //   // revert CursedByRMN() // TBD should return instead?
    //   throw ERROR_CURSED_BY_RMN
    //   }
    _checkAllowList(lockOrBurnIn.originalSender);

    _onlyOnRamp(lockOrBurnIn.remoteChainSelector);
    _consumeOutboundRateLimit(lockOrBurnIn.remoteChainSelector, lockOrBurnIn.amount);
}

/// @notice Validates the release or mint input for correctness on
/// - token to be released or minted
/// - RMN curse status
/// - if the sender is a valid offRamp
/// - if the source pool is valid
/// - rate limit status
/// @param releaseOrMintIn The input to validate.
/// @param localAmount The local amount to be released or minted.
/// @dev This function should always be called before executing a release or mint. Not doing so would allow
/// for various exploits.
fun TokenPool<T>._validateReleaseOrMint(
    mutate self,
    releaseOrMintIn: Pool_ReleaseOrMintInV1,
    localAmount: uint256,
) {
    if (!isSupportedToken(releaseOrMintIn.localToken)) {
        throw (ERROR_INVALID_TOKEN, ErrorInvalidToken{token: releaseOrMintIn.localToken}.toCell());
    }
    // if (IRMN(self.i_rmnProxy).isCursed(bytes16(uint128(releaseOrMintIn.remoteChainSelector)))) {
    //   // revert CursedByRMN() // TBD should return instead?
    //   throw ERROR_CURSED_BY_RMN
    // }
    _onlyOffRamp(releaseOrMintIn.remoteChainSelector);

    // Validates that the source pool address is configured on this pool.
    if (!isRemotePool(releaseOrMintIn.remoteChainSelector, releaseOrMintIn.sourcePoolAddress)) {
        {
            // revert InvalidSourcePoolAddress(releaseOrMintIn.sourcePoolAddress) // TBD should return instead?
            throw (ERROR_INVALID_SOURCE_POOL_ADDRESS, ErrorInvalidSourcePoolAddress{sourcePoolAddress: releaseOrMintIn.sourcePoolAddress}.toCell());
        }
    }

    _consumeInboundRateLimit(releaseOrMintIn.remoteChainSelector, localAmount);
}

// ================================================================
// │                      Token decimals                          │
// ================================================================
/// @notice Gets the IERC20 token decimals on the local chain.
fun TokenPool<T>.getTokenDecimals(self): uint8 {
    if (self.s_hooks != null && self.s_hooks.getTokenDecimals != null) {
        return self.s_hooks.getTokenDecimals()
    }
    return self.i_tokenDecimals;
}

fun TokenPool<T>._encodeLocalDecimals(self): slice {
    if (self.s_hooks != null && self.s_hooks._encodeLocalDecimals != null) {
        return self.s_hooks._encodeLocalDecimals()
    }
    return abi.encode(self.i_tokenDecimals);
}

fun TokenPool<T>._parseRemoteDecimals(self, sourcePoolData): uint8 {
    if (self.s_hooks != null && self.s_hooks._parseRemoteDecimals != null) {
        return self.s_hooks._parseRemoteDecimals(sourcePoolData)
    }
    // Fallback to the local token decimals if the source pool data is empty. This allows for backwards compatibility.
    if (sourcePoolData.length == 0) {
        return i_tokenDecimals;
    }
    if (sourcePoolData.length != 32) {
        throw (ERROR_INVALID_REMOTE_CHAIN_DECIMALS, ErrorInvalidRemoteChainDecimals{sourcePoolData}.toCell());
    }
    val remoteDecimals: uint256 = abi.decode(sourcePoolData, (uint256));
    if (remoteDecimals > type(uint8).max) {
        throw (ERROR_INVALID_REMOTE_CHAIN_DECIMALS, ErrorInvalidRemoteChainDecimals{sourcePoolData}.toCell());
    }
    return uint8(remoteDecimals);
}

/// @notice Calculates the local amount based on the remote amount and decimals.
/// @param remoteAmount The amount on the remote chain.
/// @param remoteDecimals The decimals of the token on the remote chain.
/// @return The local amount.
/// @dev This function protects against overflows. If there is a transaction that hits the overflow check, it is
/// probably incorrect as that means the amount cannot be represented on this chain. If the local decimals have been
/// wrongly configured, the token issuer could redeploy the pool with the correct decimals and manually re-execute the
/// CCIP tx to fix the issue.
fun TokenPool<T>._calculateLocalAmount(self, remoteAmount: uint256, remoteDecimals: uint8): uint256 {
    // TODO virtual; expose as hook?
    if (remoteDecimals == self.i_tokenDecimals) {
        return remoteAmount;
    }
    if (remoteDecimals > self.i_tokenDecimals) {
        val decimalsDiff: uint8 = remoteDecimals - self.i_tokenDecimals;
        if (decimalsDiff > 77) {
            // This is a safety check to prevent overflow in the next calculation.
            throw (ERROR_OVERFLOW_DETECTED, ErrorOverflowDetected{remoteDecimals, self.i_tokenDecimals, remoteAmount}.toCell());
        }
        // Solidity rounds down so there is no risk of minting more tokens than the remote chain sent.
        return remoteAmount / pow(10, decimalsDiff);
    }

    // This is a safety check to prevent overflow in the next calculation.
    // More than 77 would never fit in a uint256 and would cause an overflow. We also check if the resulting amount
    // would overflow.
    val diffDecimals: uint8 = self.i_tokenDecimals - remoteDecimals;
    if (diffDecimals > 77 || remoteAmount > type(uint256).max / pow(10, diffDecimals)) {
        throw (ERROR_OVERFLOW_DETECTED, ErrorOverflowDetected{remoteDecimals, self.i_tokenDecimals, remoteAmount}.toCell());
    }

    return remoteAmount * pow(10, diffDecimals);
}

// ================================================================
// │                     Chain permissions                        │
// ================================================================
/// @notice Gets the pool address on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @dev To support non-evm chains, this value is encoded into bytes
fun TokenPool<T>.getRemotePools(self, remoteChainSelector: uint64): slice {
    val remotePoolHashes: slice = self.s_remoteChainConfigs.get(remoteChainSelector).remotePools
        .values();

    // var remotePools  = new bytes[](remotePoolHashes.length)
    // for (var i: uint256 = 0; i < remotePoolHashes.length; ++i) {
    //   remotePools[i] = s_remotePoolAddresses[remotePoolHashes[i]]
    // }
    return remotePools;
}

/// @notice Checks if the pool address is configured on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @param remotePoolAddress The address of the remote pool.
fun TokenPool<T>.isRemotePool(
    self,
    remoteChainSelector: uint64,
    remotePoolAddress: CrossChainAddress,
): bool {
    return Iterator<uint256>.new(self.s_remoteChainConfigs.get(remoteChainSelector).remotePools).has(keccak256(remotePoolAddress));
}

/// @notice Gets the token address on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @dev To support non-evm chains, this value is encoded into bytes
fun TokenPool<T>.getRemoteToken(self, remoteChainSelector: uint64): slice {
    return self.s_remoteChainConfigs.get(remoteChainSelector).remoteTokenAddress;
}

/// @notice Adds a remote pool for a given chain selector. This could be due to a pool being upgraded on the remote
/// chain. We don't simply want to replace the old pool as there could still be valid inflight messages from the old
/// pool. This function allows for multiple pools to be added for a single chain selector.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>.addRemotePool(
    mutate self,
    sender: address,
    remoteChainSelector: uint64,
    remotePoolAddress: CrossChainAddress,
): bool {
    try {
        self.ownable.requireOwner(sender);
        if (!self.isSupportedChain(remoteChainSelector)) {
            throw (ERROR_NON_EXISTENT_CHAIN, ErrorNonExistentChain{remoteChainSelector}.toCell());
        }

        self._setRemotePool(remoteChainSelector, remotePoolAddress);
        return true;
    } catch {
        return false;
    }
}

/// @notice Removes the remote pool address for a given chain selector.
/// @dev All inflight txs from the remote pool will be rejected after it is removed. To ensure no loss of funds, there
/// should be no inflight txs from the given pool.
fun TokenPool<T>.removeRemotePool(
    mutate self,
    sender: address,
    remoteChainSelector: uint64,
    remotePoolAddress: slice,
): bool {
    try {
        self.ownable.requireOwner(sender);

        if (!self.isSupportedChain(remoteChainSelector)) {
            throw (ERROR_NON_EXISTENT_CHAIN, ErrorNonExistentChain{remoteChainSelector}.toCell());
        }

        var config = self.s_remoteChainConfigs.get(remoteChainSelector);
        if (!config.remotePools.remove(keccak256(remotePoolAddress))) {
            throw ERROR_INVALID_REMOTE_POOL_FOR_CHAIN;
        }
        self.s_remoteChainConfigs.set(remoteChainSelector, config);

        emit(TokenPool_RemotePoolRemoved { remoteChainSelector, remotePoolAddress });
        return true;
    } catch {
        return false;
    }
}

/// @inheritdoc IPoolV1
fun TokenPool<T>.isSupportedChain(self, remoteChainSelector: uint64): bool {
    return self.s_remoteChainSelectors.has(remoteChainSelector);
}

/// @notice Get list of allowed chains
/// @return list of chains.
fun TokenPool<T>.getSupportedChains(self): tuple {
    return self.s_remoteChainSelectors.keys();
}

/// @notice Sets the permissions for a list of chains selectors. Actual senders for these chains
/// need to be allowed on the Router to interact with this pool.
/// @param remoteChainSelectorsToRemove A list of chain selectors to remove.
/// @param chainsToAdd A list of chains and their new permission status & rate limits. Rate limits
/// are only used when the chain is being added through `allowed` being true.
/// @dev Only callable by the owner
fun TokenPool<T>.applyChainUpdates(
    mutate self,
    sender: address,
    chainUpdates: cell // Contains both remove and add operations,,,
): bool {
    try {
        self.ownable.requireOwner(sender);

        // Parse chainUpdates cell to extract remoteChainSelectorsToRemove and chainsToAdd
        // This is a simplified version - actual implementation would need proper cell parsing
        // TODO: Implement proper parsing of chainUpdates cell
        // For now, assume successful operation
        return true;
    } catch {
        return false;
    }
}

/// @notice Adds a pool address to the allowed remote token pools for a particular chain.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>._setRemotePool(
    mutate self,
    remoteChainSelector: uint64,
    remotePoolAddress: CrossChainAddress,
) {
    if (remotePoolAddress == createAddressNone()) {
        throw (ERROR_ZERO_ADDRESS_INVALID,ErrorZeroAddressInvalid{})
    }

    val poolHash: uint256 = keccak256(remotePoolAddress);

    // Check if the pool already exists.
    if (!s_remoteChainConfigs.get(remoteChainSelector).remotePools.delete(poolHash)) {
        throw (ERROR_POOL_ALREADY_ADDED, ErrorPoolAlreadyAdded{remoteChainSelector, remotePoolAddress}.toCell());
    }
    self.s_remoteChainConfigs.set(
        remoteChainSelector,
        (self.s_remoteChainConfigs.get(remoteChainSelector).remotePools.add(poolHash))
    );

    // Add the pool to the mapping to be able to un-hash it later.
    self.s_remotePoolAddresses.set(poolHash, remotePoolAddress);

    emit(TokenPool_RemotePoolAdded { remoteChainSelector, remotePoolAddress });
}

// ================================================================
// │                        Rate limiting                         │
// ================================================================
/// @dev The inbound rate limits should be slightly higher than the outbound rate limits. This is because many chains
/// finalize blocks in batches. CCIP also commits messages in batches: the commit plugin bundles multiple messages in
/// a single merkle root.
/// Imagine the following scenario.
/// - Chain A has an inbound and outbound rate limit of 100 tokens capacity and 1 token per second refill rate.
/// - Chain B has an inbound and outbound rate limit of 100 tokens capacity and 1 token per second refill rate.
///
/// At time 0:
/// - Chain A sends 100 tokens to Chain B.
/// At time 5:
/// - Chain A sends 5 tokens to Chain B.
/// At time 6:
/// The epoch that contains blocks [0-5] is finalized.
/// Both transactions will be included in the same merkle root and become executable at the same time. This means
/// the token pool on chain B requires a capacity of 105 to successfully execute both messages at the same time.
/// The exact additional capacity required depends on the refill rate and the size of the source chain epochs and the
/// CCIP round time. For simplicity, a 5-10% buffer should be sufficient in most cases.
/// @notice Sets the rate limiter admin address.
/// @dev Only callable by the owner.
/// @param rateLimitAdmin The new rate limiter admin address.
fun TokenPool<T>.setRateLimitAdmin(mutate self, sender: address, rateLimitAdmin: address): bool {
    try {
        self.ownable.requireOwner(sender);
        self.s_rateLimitAdmin = rateLimitAdmin;
        emit(TokenPool_RateLimitAdminSet { rateLimitAdmin });
        return true;
    } catch {
        return false;
    }
}

/// @notice Gets the rate limiter admin address.
fun TokenPool<T>.getRateLimitAdmin(self): address {
    return self.s_rateLimitAdmin;
}

/// @notice Consumes outbound rate limiting capacity in this pool
fun TokenPool<T>._consumeOutboundRateLimit(
    mutate self,
    remoteChainSelector: uint64,
    amount: uint256,
) {
    val config = self.s_remoteChainConfigs.get(remoteChainSelector);
    config.outboundRateLimiterConfig._consume(amount, address(self.i_token));
    self.s_remoteChainConfigs.set(remoteChainSelector, config);

    emit(TokenPool_OutboundRateLimitConsumed {
        token: address(self.i_token),
        remoteChainSelector,
        amount,
    });
}

/// @notice Consumes inbound rate limiting capacity in this pool
fun TokenPool<T>._consumeInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    const;
    config = self.s_remoteChainConfigs.get(remoteChainSelector);
    config.inboundRateLimiterConfig._consume(amount, address(self.i_token));
    self.s_remoteChainConfigs.set(remoteChainSelector, config);

    emit(TokenPool_InboundRateLimitConsumed {
        token: self.i_token,
        remoteChainSelector,
        amount,
    });
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun TokenPool<T>.getCurrentOutboundRateLimiterState(self, remoteChainSelector: uint64): RateLimiter_TokenBucket {
    return self.s_remoteChainConfigs.get(remoteChainSelector).outboundRateLimiterConfig
        ._currentTokenBucketState();
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun TokenPool<T>.getCurrentInboundRateLimiterState(self, remoteChainSelector: uint64): RateLimiter_TokenBucket {
    return self.s_remoteChainConfigs.get(remoteChainSelector).inboundRateLimiterConfig
        ._currentTokenBucketState();
}

/// @notice Sets multiple chain rate limiter configs.
/// @param remoteChainSelectors The remote chain selector for which the rate limits apply.
/// @param outboundConfigs The new outbound rate limiter config, meaning the onRamp rate limits for the given chain.
/// @param inboundConfigs The new inbound rate limiter config, meaning the offRamp rate limits for the given chain.
// TODO why not receive this 3 in a single iterator?
fun TokenPool<T>.setChainRateLimiterConfigs(
    mutate self,
    sender: Address,
    remoteChainSelectors: Iterator<uint64>,
    outboundConfigs: Iterator<RateLimiter_Config>,
    inboundConfigs: Iterator<RateLimiter_Config>,
) {
    if (sender != s_rateLimitAdmin) {
        self.ownable.requireOwner(sender);
    }
    if (
        remoteChainSelectors.size(8) != outboundConfigs.size(RATE_LIMITER_CONFIG_LEN) ||
        remoteChainSelectors.size(8) != inboundConfigs.size(RATE_LIMITER_CONFIG_LEN)
    ) {
        // revert MismatchedArrayLengths() // TBD should return instead?
        throw ERROR_MISMATCHED_ARRAY_LENGTHS;
    }

    while (!remoteChainSelectors.empty() && !outboundConfigs.empty() && !inboundConfigs.empty()) {
        _setRateLimitConfig(
            remoteChainSelectors.next(),
            outboundConfigs.next(),
            inboundConfigs.next()
        );
    }
}

/// @notice Sets the chain rate limiter config.
/// @param remoteChainSelector The remote chain selector for which the rate limits apply.
/// @param outboundConfig The new outbound rate limiter config, meaning the onRamp rate limits for the given chain.
/// @param inboundConfig The new inbound rate limiter config, meaning the offRamp rate limits for the given chain.
fun TokenPool<T>.setChainRateLimiterConfig(
    mutate self,
    sender: Address,
    remoteChainSelector: uint64,
    outboundConfig: RateLimiter_Config,
    inboundConfig: RateLimiter_Config,
) {
    if (sender != s_rateLimitAdmin) {
        self.ownable.requireOwner(sender);
    }
    _setRateLimitConfig(remoteChainSelector, outboundConfig, inboundConfig);
}

fun TokenPool<T>._setRateLimitConfig(
    mutate self,
    remoteChainSelector: uint64,
    outboundConfig: RateLimiter_Config,
    inboundConfig: RateLimiter_Config,
) {
    if (!isSupportedChain(remoteChainSelector)) {
        throw (ERROR_NON_EXISTENT_CHAIN, ErrorNonExistentChain{remoteChainSelector}.toCell());
    }
    RateLimiter._validateTokenBucketConfig(outboundConfig);
    {
        const;
        config = s_remoteChainConfigs.get(remoteChainSelector);
        config.outboundRateLimiterConfig._setTokenBucketConfig(outboundConfig);
        s_remoteChainConfigs.set(remoteChainSelector, config);
    }
    RateLimiter._validateTokenBucketConfig(inboundConfig);
    {
        val config = s_remoteChainConfigs.get(remoteChainSelector);
        config.inboundRateLimiterConfig._setTokenBucketConfig(inboundConfig);
        s_remoteChainConfigs.set(remoteChainSelector, config);
    }
    emit(TokenPool_ChainConfigured {
        remoteChainSelector,
        outboundRateLimiterConfig: outboundConfig,
        inboundRateLimiterConfig: inboundConfig,
    });
}

// ================================================================
// │                           Access                             │
// ================================================================
/// @notice Checks whether remote chain selector is configured on this contract, and if the msg.sender
/// is a permissioned onRamp for the given chain on the Router.
/// @dev This function is marked virtual as other token pools may inherit from this contract, but do
/// not receive calls from the ramps directly, instead receiving them from a proxy contract. In that
/// situation this function must be overridden and the ramp-check removed and replaced with a different
/// access-control scheme.
fun TokenPool<T>._onlyOnRamp(self, sender: Address, remoteChainSelector: uint64) {
    if (!isSupportedChain(remoteChainSelector)) {
        throw (ERROR_CHAIN_NOT_ALLOWED, ErrorChainNotAllowed{remoteChainSelector}.toCell());
    }
    if (!(sender == self.s_router.getOnRamp(remoteChainSelector))) {
        throw (ERROR_CALLER_IS_NOT_A_RAMP_ON_ROUTER, ErrorCallerIsNotARampOnRouter{sender}.toCell());
    }
}

/// @notice Checks whether remote chain selector is configured on this contract, and if the msg.sender
/// is a permissioned offRamp for the given chain on the Router.
/// @dev This function is marked virtual as other token pools may inherit from this contract, but do
/// not receive calls from the ramps directly, instead receiving them from a proxy contract. In that
/// situation this function must be overridden and the ramp-check removed and replaced with a different
/// access-control scheme.
fun TokenPool<T>._onlyOffRamp(mutate self, sender: address, remoteChainSelector: uint64) {
    if (!isSupportedChain(remoteChainSelector)) {
        throw (ERROR_CHAIN_NOT_ALLOWED, ErrorChainNotAllowed{remoteChainSelector}.toCell());
    }
    if (!s_router.isOffRamp(remoteChainSelector, sender)) {
        throw (ERROR_CALLER_IS_NOT_A_RAMP_ON_ROUTER, ErrorCallerIsNotARampOnRouter{sender}.toCell());
    }
}

// ================================================================
// │                          Allowlist                           │
// ================================================================
fun TokenPool<T>._checkAllowList(self, sender: address) {
    if (self.i_allowlistEnabled) {
        if (!self.s_allowlist.contains(sender)) {
            throw (ERROR_SENDER_NOT_ALLOWED, ErrorSenderNotAllowed{sender}.toCell());
        }
    }
}

/// @notice Gets whether the allowlist functionality is enabled.
/// @return true is enabled, false if not.
fun TokenPool<T>.getAllowListEnabled(self): bool {
    return self.i_allowlistEnabled;
}

/// @notice Gets the allowed addresses.
/// @return The allowed addresses.
fun TokenPool<T>.getAllowList(self): tuple {
    return (self.s_allowlist.values());
}

/// @notice Apply updates to the allow list.
/// @param removes The addresses to be removed.
/// @param adds The addresses to be added.
fun TokenPool<T>.applyAllowListUpdates(
    mutate self,
    sender: address,
    removes: cell // Array of addresses to remove,,,
): bool {
    try {
        self.ownable.requireOwner(sender);
        // TODO: Parse removes and adds cells and call _applyAllowListUpdates
        return true;
    } catch {
        return false;
    }
}

/// @notice Internal version of applyAllowListUpdates to allow for reuse in the constructor.
fun TokenPool<T>._applyAllowListUpdates(
    mutate self,
    removes: Iterator<Address>,
    adds: Iterator<Address>,
) {
    if (!i_allowlistEnabled) {
        throw (ERROR_ALLOW_LIST_NOT_ENABLED, ErrorAllowListNotEnabled{}.toCell());
    }

    while (!removes.empty()) {
        val toRemove: Address = removes.next();
        if (s_allowlist.remove(toRemove)) {
            emit(TokenPool_AllowListRemove { sender: toRemove });
        }
    }
    while (!adds.empty()) {
        val toAdd: address = adds.next();
        if (toAdd == createAddressNone()) {
            continue
        }
        if (s_allowlist.add(toAdd)) {
            emit(TokenPool_AllowListAdd { sender: toAdd });
        }
    }
}
