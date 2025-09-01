// import {IERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.tolk"
// import {IERC20Metadata} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/extensions/IERC20Metadata.tolk"
// import {IERC165} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/introspection/IERC165.tolk"
// import {EnumerableSet} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/structs/EnumerableSet.sol";
import "@stdlib/tvm-dicts"
import "../../ccip/types"
import "../access/ownable_2step"
// import {IPoolV1} from "../interfaces/IPool"
// import {IRMN} from "../interfaces/IRMN"
// import {IRouter} from "../interfaces/IRouter"
import "pool"
import "rate_limiter"
import "../jetton/jetton_client"
import "../utils"

import "./ipool"

import "./token_pool/storage"
import "./token_pool/messages"
import "./token_pool/errors"
import "./token_pool/external_messages"

tolk 1.0

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

/// @dev TokenPool contract struct with optional hooks for virtual functions
struct TokenPool<T> {
    data: TokenPool_Data
    /// Dependencies
    
    /// Ownable trait data
    ownable: Ownable2Step,

    /// Runtime hooks (extensions)
    context: T? = null
    hooks: TokenPool_Hooks<T> = null
}

// --- Hooks struct (extensions) ---
/// @dev Hook extensions exposed by the TokenPool contract.
struct TokenPool_Hooks<T> {
    /// Hook for getRouter virtual function override
    getRouter: ((T?) -> address)?
    /// Hook for getTokenDecimals virtual function override  
    getTokenDecimals: ((T?) -> uint8)?
    /// Hook for _encodeLocalDecimals virtual function override
    encodeLocalDecimals: ((T?) -> slice)?
    /// Hook for _calculateLocalAmount virtual function override
    calculateLocalAmount: ((T?, uint256, uint8) -> uint256)?

    _parseRemoteDecimals: ((T?, slice) -> uint8)?

    ipool: IPool_Hooks<T>,
}

// --- Methods ---
/// @dev Loads the TokenPool data from cell.
fun TokenPool<T>.load(dataCell: cell, ownable: Ownable2Step, ipool_hooks: IPool_Hooks<T>, context: T? = null, hooks: TokenPool_Hooks<T>? = null): TokenPool<T> {
    // Load the contract data from the persistent storage
    var data = TokenPool_Data.fromCell(dataCell);

    // Return the TokenPool instance with loaded data and hooks
    return TokenPool<T> {
        data,
        ownable,
        context,
        hooks,
    };
}

fun TokenPool<T>.ipool(self): IPool<T> {
    return IPool<T> {
        hooks: self.hooks.ipool
    };
}

// --- Message handlers ---
/// @notice Handles incoming messages for TokenPool
@inline
fun TokenPool<T>.onInternalMessage(
    mutate self,
    sender: address,
    msgValue: coins,
    msgBody: slice,
): bool {
    if (self.ipool().onInternalMessage(sender, msgValue, msgBody)) {
        return true;
    }

    val msg = lazy TokenPool_InMessage.fromSlice(msgBody);
    var response: TokenPool_Response? = null;

    match (msg) {
        TokenPool_IsSupportedToken => {
            response = TokenPool_IsSupportedTokenResponse {
                queryId: msg.queryId,
                isSupported: self.isSupportedToken(msg.token),
            };
        }
        TokenPool_GetToken => {
            response = TokenPool_GetTokenResponse {
                queryId: msg.queryId,
                token: self.getToken(),
            };
        }
        TokenPool_GetRouter => {
            response = TokenPool_GetRouterResponse {
                queryId: msg.queryId,
                router: self.getRouter(),
            };
        }
        TokenPool_SetRouter => {
        self.setRouter(sender, msg.newRouter);
            response = TokenPool_SetRouterResponse { queryId: msg.queryId };
        }
        // TODO dont know if we even need this
        // TokenPool_SupportsInterface => {
        //     response = TokenPool_SupportsInterfaceResponse {
        //         queryId: msg.queryId,
        //         supported: self.supportsInterface(msg.interfaceId),
        //     };
        // }
        // Add all remaining message handlers
        TokenPool_GetRmnProxy => {
            response = TokenPool_GetRmnProxyResponse {
                queryId: msg.queryId,
                rmnProxy: self.getRmnProxy(),
            };
        }
        TokenPool_GetTokenDecimals => {
            response = TokenPool_GetTokenDecimalsResponse {
                queryId: msg.queryId,
                decimals: self.getTokenDecimals(),
            };
        }
        TokenPool_GetRemotePools => {
            response = TokenPool_GetRemotePoolsResponse {
                queryId: msg.queryId,
                remotePools: self.getRemotePools(msg.remoteChainSelector),
            };
        }
        TokenPool_IsRemotePool => {
            response = TokenPool_IsRemotePoolResponse {
                queryId: msg.queryId,
                isRemotePool: self.isRemotePool(msg.remoteChainSelector, msg.remotePoolAddress),
            };
        }
        TokenPool_GetRemoteToken => {
            response = TokenPool_GetRemoteTokenResponse {
                queryId: msg.queryId,
                remoteToken: self.getRemoteToken(msg.remoteChainSelector),
            };
        }
        TokenPool_AddRemotePool => {
            val success = self.addRemotePool(
                sender,
                msg.remoteChainSelector,
                msg.remotePoolAddress
            );
            response = TokenPool_AddRemotePoolResponse { queryId: msg.queryId, success };
        }
        TokenPool_RemoveRemotePool => {
            val success = self.removeRemotePool(
                sender,
                msg.remoteChainSelector,
                msg.remotePoolAddress
            );
            response = TokenPool_RemoveRemotePoolResponse { queryId: msg.queryId, success };
        }
        TokenPool_IsSupportedChain => {
            response = TokenPool_IsSupportedChainResponse {
                queryId: msg.queryId,
                isSupported: self.isSupportedChain(msg.remoteChainSelector),
            };
        }
        TokenPool_GetSupportedChains => {
            response = TokenPool_GetSupportedChainsResponse {
                queryId: msg.queryId,
                supportedChains: self.getSupportedChains(),
            };
        }
        TokenPool_ApplyChainUpdates => {
            val success = self.applyChainUpdates(sender, msg.chainUpdates);
            response = TokenPool_ApplyChainUpdatesResponse { queryId: msg.queryId, success };
        }
        TokenPool_SetRateLimitAdmin => {
            val success = self.setRateLimitAdmin(sender, msg.rateLimitAdmin);
            response = TokenPool_SetRateLimitAdminResponse { queryId: msg.queryId, success };
        }
        TokenPool_GetRateLimitAdmin => {
            response = TokenPool_GetRateLimitAdminResponse {
                queryId: msg.queryId,
                rateLimitAdmin: self.getRateLimitAdmin(),
            };
        }
        TokenPool_GetCurrentOutboundRateLimiterState => {
            response = TokenPool_GetCurrentOutboundRateLimiterStateResponse {
                queryId: msg.queryId,
                state: self.getCurrentOutboundRateLimiterState(msg.remoteChainSelector),
            };
        }
        TokenPool_GetCurrentInboundRateLimiterState => {
            response = TokenPool_GetCurrentInboundRateLimiterStateResponse {
                queryId: msg.queryId,
                state: self.getCurrentInboundRateLimiterState(msg.remoteChainSelector),
            };
        }
        TokenPool_GetAllowListEnabled => {
            response = TokenPool_GetAllowListEnabledResponse {
                queryId: msg.queryId,
                enabled: self.getAllowListEnabled(),
            };
        }
        TokenPool_GetAllowList => {
            response = TokenPool_GetAllowListResponse {
                queryId: msg.queryId,
                allowList: self.getAllowList(),
            };
        }
        TokenPool_ApplyAllowListUpdates => {
            val success = self.applyAllowListUpdates(sender, msg.removes, msg.adds);
            response = TokenPool_ApplyAllowListUpdatesResponse {
                queryId: msg.queryId,
                success,
            };
        }
        else => {
        }
    }

    if (response == null) {
        return false;
    }
    createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: response,
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return true;
}


/// @notice Gets the pool's Router
/// @return router The pool's Router
/// @notice Hook-aware implementation of getRouter  
fun TokenPool<T>.getRouter(self): address {
    if (self.hooks != null && self.hooks.getRouter != null) {
        return self.hooks.getRouter(self.context); // extension hook
    }

    return self.data.s_router;
}

// --- Internal functions ---
/// @inheritdoc IPoolV1
fun TokenPool<T>.isSupportedToken(self, token: address): bool {
    return token == self.data.i_token.load().masterAddress;
}

/// @notice Gets the IERC20 token that this pool can lock or burn.
/// @return token The IERC20 token representation.
fun TokenPool<T>.getToken(self): address {
    return self.data.i_token.load().masterAddress;
}

/// @notice Get RMN proxy address
/// @return rmnProxy address of RMN proxy
fun TokenPool<T>.getRmnProxy(self): address {
    throw 1000
    // return self.data.i_rmnProxy;
}

/// @notice Sets the pool's Router
/// @param newRouter The new Router
fun TokenPool<T>.setRouter(mutate self, sender: address, newRouter: address) {
    self.ownable.requireOwner(sender);

    if (newRouter == createAddressNone()) {
        throw (TokenPool_ERROR_ZERO_ADDRESS_INVALID);
    }
    var oldRouter: address = self.data.s_router;
    self.data.s_router = newRouter;

    emit(TOKENPOOL_ROUTERUPDATED_TOPIC, TokenPool_RouterUpdated { oldRouter, newRouter });
}

/// @notice Signals which version of the pool interface is supported
// TODO dont know if we even need this
// fun TokenPool<T>.supportsInterface(self, interfaceId: bytes4): bool {
//     return interfaceId == Pool_CCIP_POOL_V1 || interfaceId == type(IPoolV1).interfaceId ||
//     interfaceId == type(IERC165).interfaceId;
// }



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
fun TokenPool<T>._validateLockOrBurn(mutate self, sender: address, lockOrBurnIn: Pool_LockOrBurnInV1) {
    if (!self.isSupportedToken(lockOrBurnIn.localToken)) {
        throw (TokenPool_ERROR_INVALID_TOKEN);
    }
    // if (IRMN(self.i_rmnProxy).isCursed(bytes16(uint128(lockOrBurnIn.remoteChainSelector)))) {
    //   // revert CursedByRMN() // TBD should return instead?
    //   throw TokenPool_ERROR_CURSED_BY_RMN
    //   }
    self._checkAllowList(lockOrBurnIn.originalSender);

    self._onlyOnRamp(sender, lockOrBurnIn.remoteChainSelector);
    self._consumeOutboundRateLimit(lockOrBurnIn.remoteChainSelector, lockOrBurnIn.amount);
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
    if (!self.isSupportedToken(releaseOrMintIn.localToken)) {
        throw (TokenPool_ERROR_INVALID_TOKEN);
    }
    // if (IRMN(self.i_rmnProxy).isCursed(bytes16(uint128(releaseOrMintIn.remoteChainSelector)))) {
    //   // revert CursedByRMN() // TBD should return instead?
    //   throw TokenPool_ERROR_CURSED_BY_RMN
    // }
    // self._onlyOffRamp(releaseOrMintIn.remoteChainSelector);

    // Validates that the source pool address is configured on this pool.
    if (!self.isRemotePool(releaseOrMintIn.remoteChainSelector, releaseOrMintIn.sourcePoolAddress)) {
        {
            throw (
                TokenPool_ERROR_INVALID_SOURCE_POOL_ADDRESS
            );
        }
    }

    self._consumeInboundRateLimit(releaseOrMintIn.remoteChainSelector, localAmount);
}

// ================================================================
// │                      Token decimals                          │
// ================================================================
/// @notice Gets the IERC20 token decimals on the local chain.
/// @notice Hook-aware implementation of getTokenDecimals
fun TokenPool<T>.getTokenDecimals(self): uint8 {
    if (self.hooks != null && self.hooks.getTokenDecimals != null) {
        return self.hooks.getTokenDecimals(self.context); // extension hook
    }
    return self.data.i_tokenDecimals;
}

/// @notice Hook-aware implementation of _encodeLocalDecimals
fun TokenPool<T>._encodeLocalDecimals(self): slice {
    if (self.hooks != null && self.hooks.encodeLocalDecimals != null) {
        return self.hooks.encodeLocalDecimals(self.context); // extension hook
    }

    return beginCell().storeUint(self.data.i_tokenDecimals, 8).endCell().beginParse();
}

fun TokenPool<T>._parseRemoteDecimals(self, sourcePoolData: slice): uint8 {
    if (self.hooks != null && self.hooks._parseRemoteDecimals != null) {
        return self.hooks._parseRemoteDecimals(null, sourcePoolData);
    }
    // Fallback to the local token decimals if the source pool data is empty. This allows for backwards compatibility.
    if (sourcePoolData.isEmpty() == 0) {
        return self.data.i_tokenDecimals;
    }
    if (sourcePoolData.remainingBitsCount() != 32*8) {
        throw (TokenPool_ERROR_INVALID_REMOTE_CHAIN_DECIMALS);
    }
    val remoteDecimals = sourcePoolData.loadUint(256);
    if (remoteDecimals > 0xff ) { // type(uint8).max
        throw (TokenPool_ERROR_INVALID_REMOTE_CHAIN_DECIMALS);
    }
    return remoteDecimals as uint8;
}

/// @notice Calculates the local amount based on the remote amount and decimals.
/// @param remoteAmount The amount on the remote chain.
/// @param remoteDecimals The decimals of the token on the remote chain.
/// @return The local amount.
/// @dev This function protects against overflows. If there is a transaction that hits the overflow check, it is
/// probably incorrect as that means the amount cannot be represented on this chain. If the local decimals have been
/// wrongly configured, the token issuer could redeploy the pool with the correct decimals and manually re-execute the
/// CCIP tx to fix the issue.
/// @notice Hook-aware implementation of _calculateLocalAmount
fun TokenPool<T>._calculateLocalAmount(self, remoteAmount: uint256, remoteDecimals: uint8): uint256 {
    if (self.hooks != null && self.hooks.calculateLocalAmount != null) {
        return self.hooks.calculateLocalAmount(self.context, remoteAmount, remoteDecimals); // extension hook
    }

    if (remoteDecimals == self.data.i_tokenDecimals) {
        return remoteAmount;
    }
    if (remoteDecimals > self.data.i_tokenDecimals) {
        val decimalsDiff: uint8 = remoteDecimals - self.data.i_tokenDecimals;
        if (decimalsDiff > 77) {
            // This is a safety check to prevent overflow in the next calculation.
            throw (TokenPool_ERROR_OVERFLOW_DETECTED);
        }
        // Solidity rounds down so there is no risk of minting more tokens than the remote chain sent.
        return remoteAmount / pow(10, decimalsDiff);
    }

    // This is a safety check to prevent overflow in the next calculation.
    // More than 77 would never fit in a uint256 and would cause an overflow. We also check if the resulting amount
    // would overflow.
    val diffDecimals: uint8 = self.data.i_tokenDecimals - remoteDecimals;
    if (diffDecimals > 77 || remoteAmount > 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff /*type(uint256).max*/ / pow(10, diffDecimals)) {
        throw (TokenPool_ERROR_OVERFLOW_DETECTED);
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
    val (remoteChainConfig, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (remoteChainConfig != null) throw TokenPool_ERROR_NON_EXISTENT_CHAIN;
    val remotePoolHashes = Iterator<bytes32>.new(remoteChainConfig.remotePools);

    var remotePools  = UMap<uint256, CrossChainAddress>.new(256);
    var i: uint64 = 0;
    while (!remotePoolHashes.empty()) {
      remotePools.set(i, self.data.s_remotePoolAddresses.get(remotePoolHashes.next()));
      i += 1;
    }
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
    return true;
//     return Iterator<uint256>.new(self.data.s_remoteChainConfigs.get(remoteChainSelector).remotePools).has(keccak256(remotePoolAddress));
}

/// @notice Gets the token address on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @dev To support non-evm chains, this value is encoded into bytes
fun TokenPool<T>.getRemoteToken(self, remoteChainSelector: uint64): slice {
    var (remoteChainConfig, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (remoteChainConfig != null) throw TokenPool_ERROR_NON_EXISTENT_CHAIN;
    return remoteChainConfig.remoteTokenAddress;
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
) {
    self.ownable.requireOwner(sender);
    if (!self.isSupportedChain(remoteChainSelector)) {
        throw (TokenPool_ERROR_NON_EXISTENT_CHAIN);
    }

    self._setRemotePool(remoteChainSelector, remotePoolAddress);
}

/// @notice Removes the remote pool address for a given chain selector.
/// @dev All inflight txs from the remote pool will be rejected after it is removed. To ensure no loss of funds, there
/// should be no inflight txs from the given pool.
fun TokenPool<T>.removeRemotePool(
    mutate self,
    sender: address,
    remoteChainSelector: uint64,
    remotePoolAddress: slice,
) {
    self.ownable.requireOwner(sender);

    if (!self.isSupportedChain(remoteChainSelector)) {
        throw (TokenPool_ERROR_NON_EXISTENT_CHAIN);
    }

    var (remoteChainConfig, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (remoteChainConfig != null) throw TokenPool_ERROR_NON_EXISTENT_CHAIN;
    if (!remoteChainConfig.remotePools.delete(keccak256(remotePoolAddress))) {
        throw TokenPool_ERROR_INVALID_REMOTE_POOL_FOR_CHAIN;
    }
    self.data.s_remoteChainConfigs.set(remoteChainSelector, remoteChainConfig);

    emit(TOKENPOOL_REMOTEPOOLREMOVED_TOPIC, TokenPool_RemotePoolRemoved { remoteChainSelector, remotePoolAddress });
}

/// @inheritdoc IPoolV1
fun TokenPool<T>.isSupportedChain(self, remoteChainSelector: uint64): bool {
    return self.data.s_remoteChainSelectors.has(remoteChainSelector);
}

/// @notice Get list of allowed chains
/// @return list of chains.
fun TokenPool<T>.getSupportedChains(self): tuple {
    return self.data.s_remoteChainSelectors.keys();
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
    chainUpdates: cell, // Contains both remove and add operations
) {
    self.ownable.requireOwner(sender);

    // Parse chainUpdates cell to extract remoteChainSelectorsToRemove and chainsToAdd
    // This is a simplified version - actual implementation would need proper cell parsing
    // TODO: Implement proper parsing of chainUpdates cell
    // For now, assume successful operation

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
        throw (TokenPool_ERROR_ZERO_ADDRESS_INVALID);
    }

    val poolHash: uint256 = keccak256(remotePoolAddress);

    // Check if the pool already exists.
    var (remoteChainConfig, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (remoteChainConfig != null) throw (TokenPool_ERROR_NON_EXISTENT_CHAIN);
    if (!remoteChainConfig.remotePools.delete(poolHash)) {
        throw (TokenPool_ERROR_POOL_ALREADY_ADDED);
    }
    remoteChainConfig.remotePools.set(poolHash, poolHash);

    self.data.s_remoteChainConfigs.set(
        remoteChainSelector,
        remoteChainConfig
    );

    // Add the pool to the mapping to be able to un-hash it later.
    self.data.s_remotePoolAddresses.set(poolHash, remotePoolAddress);

    emit(TOKENPOOL_REMOTEPOOLADDED_TOPIC, TokenPool_RemotePoolAdded { remoteChainSelector, remotePoolAddress });
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
fun TokenPool<T>.setRateLimitAdmin(mutate self, sender: address, rateLimitAdmin: address) {
    self.ownable.requireOwner(sender);
    self.data.s_rateLimitAdmin = rateLimitAdmin;
    emit(TOKENPOOL_RATELIMITADMINSET_TOPIC, TokenPool_RateLimitAdminSet { rateLimitAdmin });
}

/// @notice Gets the rate limiter admin address.
fun TokenPool<T>.getRateLimitAdmin(self): address {
    return self.data.s_rateLimitAdmin;
}

/// @notice Consumes outbound rate limiting capacity in this pool
fun TokenPool<T>._consumeOutboundRateLimit(
    mutate self,
    remoteChainSelector: uint64,
    amount: uint256,
) {
    val (config, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (config != null) throw 1000;
    val token = self.data.i_token.load();
    config.outboundRateLimiterConfig._consume(amount, token.masterAddress);
    self.data.s_remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOKENPOOL_OUTBOUNDRATELIMITCONSUMED_TOPIC, TokenPool_OutboundRateLimitConsumed {
        token: token.masterAddress,
        remoteChainSelector,
        amount,
    });
}

/// @notice Consumes inbound rate limiting capacity in this pool
fun TokenPool<T>._consumeInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    val (config, ok) = self.data.s_remoteChainConfigs.get(remoteChainSelector);
    assert (config != null) throw 1000;
    val jetton = lazy self.data.i_token.load();
    config.inboundRateLimiterConfig._consume(amount, jetton.masterAddress);
    self.data.s_remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOKENPOOL_INBOUNDRATELIMITCONSUMED_TOPIC, TokenPool_InboundRateLimitConsumed {
        token: jetton.masterAddress,
        remoteChainSelector,
        amount,
    });
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun TokenPool<T>.getCurrentOutboundRateLimiterState(self, remoteChainSelector: uint64): RateLimiter_TokenBucket {
    return self.data.s_remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_ERROR_NON_EXISTENT_CHAIN).outboundRateLimiterConfig
        ._currentTokenBucketState();
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun TokenPool<T>.getCurrentInboundRateLimiterState(self, remoteChainSelector: uint64): RateLimiter_TokenBucket {
    return self.data.s_remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_ERROR_NON_EXISTENT_CHAIN).inboundRateLimiterConfig
        ._currentTokenBucketState();
}

/// @notice Sets multiple chain rate limiter configs.
/// @param remoteChainSelectors The remote chain selector for which the rate limits apply.
/// @param outboundConfigs The new outbound rate limiter config, meaning the onRamp rate limits for the given chain.
/// @param inboundConfigs The new inbound rate limiter config, meaning the offRamp rate limits for the given chain.
// TODO why not receive this 3 in a single iterator?
fun TokenPool<T>.setChainRateLimiterConfigs(
    mutate self,
    sender: address,
    remoteChainSelectors: Iterator<uint64>,
    outboundConfigs: Iterator<RateLimiter_Config>,
    inboundConfigs: Iterator<RateLimiter_Config>,
) {
    if (sender != self.data.s_rateLimitAdmin) {
        self.ownable.requireOwner(sender);
    }
    if (
        remoteChainSelectors.size(8) != outboundConfigs.size(RATE_LIMITER_CONFIG_LEN) ||
        remoteChainSelectors.size(8) != inboundConfigs.size(RATE_LIMITER_CONFIG_LEN)
    ) {
        // revert MismatchedArrayLengths() // TBD should return instead?
        throw TokenPool_ERROR_MISMATCHED_ARRAY_LENGTHS;
    }

    while (!remoteChainSelectors.empty() && !outboundConfigs.empty() && !inboundConfigs.empty()) {
        self._setRateLimitConfig(
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
    sender: address,
    remoteChainSelector: uint64,
    outboundConfig: RateLimiter_Config,
    inboundConfig: RateLimiter_Config,
) {
    if (sender != self.s_rateLimitAdmin) {
        self.ownable.requireOwner(sender);
    }
    self._setRateLimitConfig(remoteChainSelector, outboundConfig, inboundConfig);
}

fun TokenPool<T>._setRateLimitConfig(
    mutate self,
    remoteChainSelector: uint64,
    outboundConfig: RateLimiter_Config,
    inboundConfig: RateLimiter_Config,
) {
    if (!self.isSupportedChain(remoteChainSelector)) {
        throw (TokenPool_ERROR_NON_EXISTENT_CHAIN);
    }
    RateLimiter._validateTokenBucketConfig(outboundConfig);
    {
        val config = self.data.s_remoteChainConfigs.get(remoteChainSelector);
        config.outboundRateLimiterConfig._setTokenBucketConfig(outboundConfig);
        self.data.s_remoteChainConfigs.set(remoteChainSelector, config);
    }
    RateLimiter._validateTokenBucketConfig(inboundConfig);
    {
        val config = self.data.s_remoteChainConfigs.get(remoteChainSelector);
        config.inboundRateLimiterConfig._setTokenBucketConfig(inboundConfig);
        self.data.s_remoteChainConfigs.set(remoteChainSelector, config);
    }
    emit(TOKENPOOL_CHAINCONFIGURED_TOPIC, TokenPool_ChainConfigured {
        remoteChainSelector,
        outboundRateLimiterConfig: outboundConfig,
        inboundRateLimiterConfig: inboundConfig,
    });
}

// ================================================================
// │                           Access                             │
// ================================================================
// TODO maybe we should pipe onramp and offramp messages through the token pool
/// @notice Checks whether remote chain selector is configured on this contract, and if the msg.sender
/// is a permissioned onRamp for the given chain on the Router.
/// @dev This function is marked virtual as other token pools may inherit from this contract, but do
/// not receive calls from the ramps directly, instead receiving them from a proxy contract. In that
/// situation this function must be overridden and the ramp-check removed and replaced with a different
/// access-control scheme.
fun TokenPool<T>._onlyOnRamp(self, sender: address, remoteChainSelector: uint64) {
//     if (!self.isSupportedChain(remoteChainSelector)) {
//         throw (TokenPool_ERROR_CHAIN_NOT_ALLOWED);
//     }
//     if (!(sender == self.s_router.getOnRamp(remoteChainSelector))) {
//         throw (TokenPool_ERROR_CALLER_IS_NOT_A_RAMP_ON_ROUTER);
//     }
}

// /// @notice Checks whether remote chain selector is configured on this contract, and if the msg.sender
// /// is a permissioned offRamp for the given chain on the Router.
// /// @dev This function is marked virtual as other token pools may inherit from this contract, but do
// /// not receive calls from the ramps directly, instead receiving them from a proxy contract. In that
// /// situation this function must be overridden and the ramp-check removed and replaced with a different
// /// access-control scheme.
fun TokenPool<T>._onlyOffRamp(mutate self, sender: address, remoteChainSelector: uint64) {
//     if (!self.isSupportedChain(remoteChainSelector)) {
//         throw (TokenPool_ERROR_CHAIN_NOT_ALLOWED);
//     }
//     if (!self.data.s_router.isOffRamp(remoteChainSelector, sender)) {
//         throw (TokenPool_ERROR_CALLER_IS_NOT_A_RAMP_ON_ROUTER);
//     }
}

// ================================================================
// │                          Allowlist                           │
// ================================================================
fun TokenPool<T>._checkAllowList(self, sender: address) {
    if (self.data.i_allowlistEnabled) {
        val (_, ok) = self.data.s_allowlist.get(sender);
        if (!ok) {
            throw (TokenPool_ERROR_SENDER_NOT_ALLOWED);
        }
    }
}

/// @notice Gets whether the allowlist functionality is enabled.
/// @return true is enabled, false if not.
fun TokenPool<T>.getAllowListEnabled(self): bool {
    return self.data.i_allowlistEnabled;
}

/// @notice Gets the allowed addresses.
/// @return The allowed addresses.
fun TokenPool<T>.getAllowList(self): tuple {
    return (self.data.s_allowlist.keys());
}

/// @notice Apply updates to the allow list.
/// @param removes The addresses to be removed.
/// @param adds The addresses to be added.
fun TokenPool<T>.applyAllowListUpdates(
    mutate self,
    sender: address,
    removes: cell, // Array of addresses to remove
    adds: cell, // Array of addresses to add
) {
    self.ownable.requireOwner(sender);
    self._applyAllowListUpdates(
        Iterator<address>.new(removes),
        Iterator<address>.new(adds),
    );
}

/// @notice Internal version of applyAllowListUpdates to allow for reuse in the constructor.
fun TokenPool<T>._applyAllowListUpdates(
    mutate self,
    removes: Iterator<address>,
    adds: Iterator<address>,
) {
    if (!self.data.i_allowlistEnabled) {
        throw (TokenPool_ERROR_ALLOW_LIST_NOT_ENABLED);
    }

    while (!removes.empty()) {
        val toRemove: address = removes.next();
        if (self.data.s_allowlist.delete(toRemove)) {
            emit(TOKENPOOL_ALLOWLISTREMOVE_TOPIC, TokenPool_AllowListRemove { sender: toRemove });
        }
    }
    while (!adds.empty()) {
        val toAdd: address = adds.next();
        if (toAdd != createAddressNone() && self.data.s_allowlist.set(toAdd, true)) {
            emit(TOKENPOOL_ALLOWLISTADD_TOPIC, TokenPool_AllowListAdd { sender: toAdd });
        }
    }
}


/// Utils
fun pow(a: int,  n: int): int {
    var i: int = 0;
    var value: int = a;
    while (i < n - 1) {
        a *= value;
        i += 1;
    }
    return a;
}
