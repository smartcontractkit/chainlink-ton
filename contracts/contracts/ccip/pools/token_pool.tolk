// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../../lib/math"
import "../../lib/utils"
import "../../lib/jetton/messages"
import "../../lib/jetton/jetton_client"
import "../../lib/access/ownable_2step"
import "../common/types"
import "../rmn_remote/lib"

import "types"
import "errors"
import "messages"
import "events"
import "rate_limiter"

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
struct TokenPool<T> {
    data: TokenPool_Data;
    context: T? = null;
    hooks: TokenPool_Hooks<T>? = null;
}

struct TokenPool_AdminConfig {
    ownable: Cell<Ownable2Step>;
    rmnProxy: address;
    dynamicConfig: Cell<TokenPool_DynamicConfig>;
    /// The pool's Jetton identity (master + wallet code). Single source of truth used to
    /// derive and authenticate the pool's own wallet.
    jettonClient: JettonClient;
    /// Allowed finality config for fast finality transfers (see `FinalityCodec`).
    /// FinalityCodec.WAIT_FOR_FINALITY_FLAG means wait for finality.
    allowedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY;
    /// Optional advanced pool hooks contract for additional features like allowlists and CCV management.
    advancedPoolHooks: address?;
}

struct TokenPool_Data {
    adminConfig: Cell<TokenPool_AdminConfig>;
    mirroredPolicy: Cell<TokenPool_MirroredPolicy>;
    tokenDecimals: uint8;
    remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>;
    tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>;
}

@inline
fun TokenPool_Data.fromContractData() {
    return TokenPool_Data.fromCell(contract.getData());
}

@inline
fun TokenPool_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}

// --- Hooks struct (extensions) ---

/// Hook extensions exposed by the TokenPool contract.
struct TokenPool_Hooks<T> {
    ensureOutboundAccess: ((T?, address, uint64) -> void)?;
    ensureInboundAccess: ((T?, address, uint64) -> void)?;
    ensureNotCursed: ((T?, uint64) -> void)?;

    // ReleaseOrMint flow
    onReleaseOrMint: ((T, TokenPool_ReleaseOrMint) -> T)?;
    validateReleaseOrMint: ((T, address, TokenPool_ReleaseOrMint) -> (T, bool, TokenPool_ReleaseOrMintPrepared))?;
    postflightCheck: ((T?, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintForwardPayload) -> bool)?;
    onReleaseOrMintContinue: ((T?, address, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintPrepared) -> T?)?;

    // LockOrBurn flow
    onLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> T)?;
    validateLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> (T, bool, TokenPool_LockOrBurnPrepared))?;
    preflightCheck: ((T?, TokenPool_LockOrBurn, TokenPool_LockOrBurnForwardPayload) -> bool)?;
    onLockOrBurnTransfer: ((T, address, TransferNotificationForRecipient) -> T)?;
    onLockOrBurnTransferContinue: ((T, address, TokenPool_LockOrBurnForwardPayload) -> T)?;
}

@inline
fun TokenPool<T>.load(context: T? = null, hooks: TokenPool_Hooks<T>? = null): TokenPool<T> {
    val data = TokenPool_Data.fromContractData();
    return TokenPool<T> { data, context, hooks };
}

fun TokenPool<T>.store(self) {
    self.data.storeAsContractData();
}

/// Return the JettonClient for the pool, which contains the
/// master address and wallet code for the token.
@inline
fun TokenPool_Data.jettonClient(self): JettonClient {
    val ac = lazy self.adminConfig.load();
    return ac.jettonClient;
}

/// The Jetton master address this pool serves.
@inline
fun TokenPool_Data.token(self): address {
    val ac = lazy self.adminConfig.load();
    return ac.jettonClient.masterAddress;
}

/// Returns if the token pool supports the given token.
/// @param token The address of the token.
@inline
fun TokenPool<T>.isSupportedToken(self, token: address): bool {
    return self.data.token() == token;
}

/// Gets the Jetton token that this pool can lock or burn.
/// @return token The Jetton token representation.
@inline
fun TokenPool<T>.getToken(self): address {
    return self.data.token();
}

/// Gets the Jetton token decimals on the local chain.
@inline
fun TokenPool<T>.getTokenDecimals(self): uint8 {
    return self.data.tokenDecimals;
}

@inline
fun TokenPool<T>.getRmnProxy(self): address {
    val ac = lazy self.data.adminConfig.load();
    return ac.rmnProxy;
}

/// Gets the pools dynamic configuration.
@inline
fun TokenPool<T>.getDynamicConfig(self): TokenPool_DynamicConfig {
    val ac = lazy self.data.adminConfig.load();
    return ac.dynamicConfig.load();
}

/// Gets the finality config as defined in the FinalityCodec library. This value does NOT 1:1 translate to
/// a block depth. The finality config contains special flags and should only be encoded/decoded using the
/// FinalityCodec library. Checks must happen by calling `FinalityCodec._ensureRequestedFinalityAllowed`.
@inline
fun TokenPool<T>.getAllowedFinalityConfig(self): uint32 {
    val ac = lazy self.data.adminConfig.load();
    return ac.allowedFinalityConfig;
}

/// Gets the advanced pool hook contract address used by this pool.
@inline
fun TokenPool<T>.getAdvancedPoolHooks(self): address? {
    return self.data.adminConfig.load().advancedPoolHooks;
}

@inline
fun TokenPool<T>.getOnRamp(self, remoteChainSelector: uint64): address? {
    val entry = self.data.mirroredPolicy.load().onRamps.get(remoteChainSelector);
    return entry.isFound ? entry.loadValue() : null;
}

@inline
fun TokenPool<T>.getOffRamp(self, remoteChainSelector: uint64): address? {
    val entry = self.data.mirroredPolicy.load().offRamps.get(remoteChainSelector);
    return entry.isFound ? entry.loadValue() : null;
}

@inline
fun TokenPool<T>.verifyNotCursed(self, subject: uint128): bool {
    return !self.data.mirroredPolicy.load().cursedSubjects.isCursed(subject);
}

/// Checks whether a remote chain is supported in the token pool.
/// @param remoteChainSelector The remote chain selector to check.
@inline
fun TokenPool<T>.isSupportedChain(self, remoteChainSelector: uint64): bool {
    return self.data.remoteChainConfigs.get(remoteChainSelector).isFound;
}

/// Get list of allowed chains
fun TokenPool<T>.getSupportedChains(self): lisp_list<uint64> {
    return keysLispList(self.data.remoteChainConfigs);
}

/// Checks if the pool address is configured on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @param remotePoolAddress The address of the remote pool.
fun TokenPool<T>.isRemotePool(self, remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    val entry = self.data.remoteChainConfigs.get(remoteChainSelector);
    if (!entry.isFound) {
        return false;
    }

    val config = entry.loadValue();
    return config.remotePools.get(remotePoolAddress.hash()).isFound;
}

/// Gets the token address on the remote chain.
/// @param remoteChainSelector Remote chain selector.
fun TokenPool<T>.getRemoteToken(self, remoteChainSelector: uint64): Cell<CrossChainAddress> {
    val config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    return config.remoteTokenAddress;
}

/// Gets the pool address on the remote chain.
/// @param remoteChainSelector Remote chain selector.
fun TokenPool<T>.getRemotePools(self, remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>> {
    val config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var list: lisp_list<Cell<CrossChainAddress>> = [];
    var entry = config.remotePools.findFirst();
    while (entry.isFound) {
        list.prependHead(entry.loadValue());
        entry = config.remotePools.iterateNext(entry);
    }
    return list;
}

/// Sets the dynamic configuration for the pool.
/// @param router The address of the router contract.
/// @param rateLimitAdmin The address of the rate limiter admin.
/// @param feeAdmin An additional address that can withdraw fees from this contract.
/// @dev FeeTokenHandler will revert if feeAdmin is zero when withdrawing fees.
/// @dev If only the owner can withdraw fees, set feeAdmin to address(0).
fun TokenPool<T>.setDynamicConfig(
    mutate self,
    sender: address,
    queryId: uint64,
    router: address,
    rateLimitAdmin: address?,
    feeAdmin: address?,
) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    // TODO: check if address is valid (not zero)
    // assert(!router.isNone(), TokenPool_Error.ZeroAddressInvalid);
    adminConfig.dynamicConfig = TokenPool_DynamicConfig {
        router,
        rateLimitAdmin,
        feeAdmin,
    }.toCell();
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_DynamicConfigSet {
            queryId,
            router,
            rateLimitAdmin,
            feeAdmin,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Sets the finality config according to the FinalityCodec library encoding.
/// @param allowedFinality The finality settings allowed in this pool, according to the FinalityCodec encoding.  
fun TokenPool<T>.setAllowedFinalityConfig(mutate self, sender: address, queryId: uint64, allowedFinalityConfig: uint32) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);
    // Any bytes4 value is accepted as allowedFinality; the FinalityCodec semantics are enforced when requests are
    // checked against this value via FinalityCodec._ensureRequestedFinalityAllowed.
    adminConfig.allowedFinalityConfig = allowedFinalityConfig;
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_FinalityConfigSet {
            queryId,
            allowedFinalityConfig,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.setAdvancedPoolHooks(
    mutate self,
    sender: address,
    queryId: uint64,
    advancedPoolHooks: address?
) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    adminConfig.advancedPoolHooks = advancedPoolHooks;
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_AdvancedPoolHooksSet {
            queryId,
            advancedPoolHooks,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Adds a remote pool for a given chain selector. This could be due to a pool being upgraded on the remote
/// chain. We don't simply want to replace the old pool as there could still be valid inflight messages from the old
/// pool. This function allows for multiple pools to be added for a single chain selector.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>.addRemotePool(
    mutate self,
    sender: address,
    queryId: uint64,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.NonExistentChain);

    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    self._setRemotePool(mutate config, remoteChainSelector, remotePoolAddress);
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_RemotePoolAddedNotification {
            queryId,
            remoteChainSelector,
            remotePoolAddress,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Removes the remote pool address for a given chain selector.
/// @dev All inflight txs from the remote pool will be rejected after it is removed. To ensure no loss of funds, there
/// should be no inflight txs from the given pool.
/// @param remoteChainSelector The remote chain selector.
/// @param remotePoolAddress The remote pool address to remove.
fun TokenPool<T>.removeRemotePool(
    mutate self,
    sender: address,
    queryId: uint64,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.NonExistentChain);

    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    val deleted = config.remotePools.delete(remotePoolAddress.hash());
    assert(deleted, TokenPool_Error.InvalidRemotePoolForChain);
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // We emit in addition to reply to sender, to stay consistent with TokenPool_RemotePoolAdded event
    emit(TOPIC_TOKEN_POOL_REMOTE_POOL_REMOVED, TokenPool_RemotePoolRemoved {
        remoteChainSelector,
        remotePoolAddress,
    });

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_RemotePoolRemovedNotification {
            queryId,
            remoteChainSelector,
            remotePoolAddress,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Sets the permissions for a list of chains selectors. Actual senders for these chains
/// need to be allowed on the Router to interact with this pool.
/// @param remoteChainSelectorsToRemove A list of chain selectors to remove.
/// @param chainsToAdd A list of chains and their new permission status & rate limits. Rate limits
/// are only used when the chain is being added through `allowed` being true.
/// @dev Only callable by the owner
fun TokenPool<T>.applyChainUpdates(
    mutate self,
    sender: address,
    queryId: uint64,
    remoteChainSelectorsToRemove: SnakedCell<uint64>,
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);

    var rmIter = remoteChainSelectorsToRemove.iter();
    while (!rmIter.empty()) {
        val remoteChainSelector = rmIter.next();
        val deleted = self.data.remoteChainConfigs.delete(remoteChainSelector);
        assert(deleted, TokenPool_Error.NonExistentChain);

        emit(TOPIC_TOKEN_POOL_CHAIN_REMOVED, TokenPool_ChainRemoved { remoteChainSelector });
    }

    var addIter = chainsToAdd.iter();
    while (!addIter.empty()) {
        val newChain = addIter.next();
        val remoteTokenAddress = newChain.remoteTokenAddress;
        assert(!TokenPool_isEmptyCrossChainAddress(remoteTokenAddress), TokenPool_Error.ZeroAddressInvalid);

        val remoteChainSelector = newChain.remoteChainSelector;
        assert(!self.data.remoteChainConfigs.get(remoteChainSelector).isFound, TokenPool_Error.ChainAlreadyExists);

        val rlConfigDefault = RateLimiter_Config {
            isEnabled: false,
            capacity: 0,
            rate: 0,
        };

        var rateLimitConfigs = newChain.rateLimitConfigs.load();
        var config = TokenPool_RemoteChainConfig {
            remoteTokenAddress,
            remotePools: createEmptyMap(),
            rateLimiters: TokenPool_RateLimiterPair {
                outbound: RateLimiter_TokenBucket.fromConfig(rateLimitConfigs.outbound.load()).toCell(),
                inbound: RateLimiter_TokenBucket.fromConfig(rateLimitConfigs.inbound.load()).toCell(),
            }.toCell(),
            fastFinalityRateLimiters: TokenPool_RateLimiterPair {
                outbound: RateLimiter_TokenBucket.fromConfig(rlConfigDefault).toCell(),
                inbound: RateLimiter_TokenBucket.fromConfig(rlConfigDefault).toCell(),
            }.toCell(),
        };

        var rpAddrIter = newChain.remotePoolAddresses.iter();
        while (!rpAddrIter.empty()) {
            val remotePoolAddress = rpAddrIter.next().toCell();
            self._setRemotePool(mutate config, remoteChainSelector, remotePoolAddress);
        }

        self.data.remoteChainConfigs.set(remoteChainSelector, config);

        emit(TOPIC_TOKEN_POOL_CHAIN_ADDED, TokenPool_ChainAdded {
            remoteChainSelector,
            remoteTokenAddress,
        });
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_ChainUpdatesApplied { queryId },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.applyRampAccessUpdates(
    mutate self,
    sender: address,
    queryId: uint64,
    updates: SnakedCell<TokenPool_RampUpdate>,
) {
    val adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    var mirroredPolicy = self.data.mirroredPolicy.load();
    var iter = updates.iter();
    while (!iter.empty()) {
        val update = iter.next();

        if (update.onRamp != null) {
            mirroredPolicy.onRamps.set(update.remoteChainSelector, update.onRamp!);
        } else {
            mirroredPolicy.onRamps.delete(update.remoteChainSelector);
        }

        if (update.offRamp != null) {
            mirroredPolicy.offRamps.set(update.remoteChainSelector, update.offRamp!);
        } else {
            mirroredPolicy.offRamps.delete(update.remoteChainSelector);
        }

        emit(TOPIC_TOKEN_POOL_RAMP_ACCESS_UPDATED, TokenPool_RampAccessUpdated {
            remoteChainSelector: update.remoteChainSelector,
            onRamp: update.onRamp,
            offRamp: update.offRamp,
        });
    }

    self.data.mirroredPolicy = mirroredPolicy.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_RampAccessUpdatesApplied { queryId },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.setRMNProxy(
    mutate self,
    sender: address,
    queryId: uint64,
    rmnProxy: address
) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    adminConfig.rmnProxy = rmnProxy;
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_RMNProxySet { queryId, rmnProxy },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.setCursedSubjects(
    mutate self,
    sender: address,
    queryId: uint64,
    cursedSubjects: CursedSubjects,
) {
    self.onlyOwnerOrRMNProxy(sender);

    var mirroredPolicy = self.data.mirroredPolicy.load();
    mirroredPolicy.cursedSubjects = cursedSubjects;
    self.data.mirroredPolicy = mirroredPolicy.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_CursedSubjectsSet { queryId, cursedSubjects },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.onInternalMessage(mutate self, msgSender: address, msgValue: coins, msgBody: slice): bool {
    val msg = lazy TokenPool_InMessage.fromSlice(msgBody);

    match (msg) {
        TokenPool_LockOrBurn => {
            self.onLockOrBurn(msgSender, msg);
        }
        TokenPool_PreflightCheckFinished => {
            self.onPreflightCheckFinished(msgSender, msg);
        }
        TokenPool_PreflightCheckFailed => {
            self.onPreflightCheckFailed(msgSender, msg);
        }
        // Once we withdraw via Executor -> OnRamp -> JettonWallet, we will receive a TransferNotificationForRecipient callback,
        // which is only allowed to be called by a valid OnRamp address, otherwise we try a best effort return.
        //
        // In the worst case, not enough funds, received Jettons are burned.
        TransferNotificationForRecipient => {
            self.onLockOrBurnTransfer(msgSender, msg);
        }
        TokenPool_ReleaseOrMint => {
            self.onReleaseOrMint(msgSender, msg);
        }
        TokenPool_PostflightCheckFinished => {
            self.onPostflightCheckFinished(msgSender, msg);
        }
        TokenPool_PostflightCheckFailed => {
            self.onPostflightCheckFailed(msgSender, msg);
        }
         TokenPool_ApplyChainUpdates => {
            self.applyChainUpdates(msgSender, msg.queryId, msg.remoteChainSelectorsToRemove, msg.chainsToAdd);
        }
        TokenPool_AddRemotePool => {
            self.addRemotePool(msgSender, msg.queryId, msg.remoteChainSelector, msg.remotePoolAddress);
        }
        TokenPool_RemoveRemotePool => {
            self.removeRemotePool(msgSender, msg.queryId, msg.remoteChainSelector, msg.remotePoolAddress);
        }
        TokenPool_SetDynamicConfig => {
            self.setDynamicConfig(msgSender, msg.queryId, msg.router, msg.rateLimitAdmin, msg.feeAdmin);
        }
        TokenPool_SetAllowedFinalityConfig => {
            self.setAllowedFinalityConfig(msgSender, msg.queryId, msg.allowedFinalityConfig);
        }
        TokenPool_SetAdvancedPoolHooks => {
            self.setAdvancedPoolHooks(msgSender, msg.queryId, msg.advancedPoolHooks);
        }
        TokenPool_SetRateLimitConfig => {
            self.setRateLimitConfig(msgSender, msg.queryId, msg.updates);
        }
        TokenPool_ApplyTokenTransferFeeConfigUpdates => {
            self.applyTokenTransferFeeConfigUpdates(msgSender, msg.queryId, msg.updates, msg.disableChainSelectors);
        }
        TokenPool_UpdateRampAccess => {
            self.applyRampAccessUpdates(msgSender, msg.queryId, msg.updates);
        }
        TokenPool_SetRMNProxy => {
            self.setRMNProxy(msgSender, msg.queryId, msg.rmnProxy);
        }
        TokenPool_SetCursedSubjects => {
            self.setCursedSubjects(msgSender, msg.queryId, msg.cursedSubjects);
        }
        else => {
            var adminConfig = self.data.adminConfig.load();
            var ownable = adminConfig.ownable.load();
            val handled = ownable.onInternalMessage(msgSender, msgBody);
            if (handled) {
                adminConfig.ownable = ownable.toCell();
                self.data.adminConfig = adminConfig.toCell();
                return true;
            }

            return msgBody.isEmpty();
        }
    }

    return true; // default
}

// TODO: implement onBouncedMessage (lib) handler
//  - use `pool.releaseInboundRateLimit` and `pool.releaseOutboundRateLimit` to return the consumed capacity back on error

// ================================================================
// │              Async preflight/postflight callbacks              │
// ================================================================

/// Resumes the LockOrBurn flow after the advanced hooks confirmed the preflight check.
/// @dev Rate limit was already consumed before the hook check; no need to consume again.
fun TokenPool<T>.onPreflightCheckFinished(
    mutate self,
    sender: address,
    msg: TokenPool_PreflightCheckFinished,
): void {
    val fwdp = msg.forwardPayload.load();
    val originalSender = fwdp.originalSender;
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    // Continue with the withdraw (Jetton transfer into the pool).
    self.onLockOrBurnWithdraw(originalSender, requestMsg, prepared);
}

/// Handles preflight check failure from advanced hooks: refund rate limit + propagate error.
/// @dev Rate limit was consumed before the hook check; refund it here on hook rejection.
fun TokenPool<T>.onPreflightCheckFailed(
    mutate self,
    sender: address,
    msg: TokenPool_PreflightCheckFailed,
): void {
    val fwdp = msg.forwardPayload.load();
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    // Refund outbound rate limit that was consumed before the hook check.
    val request = requestMsg.request.load();
    val details = request.transfer.details.load();
    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        self.releaseFastFinalityOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    } else {
        self.releaseOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    }

    // Send failure response back to the executor (replyTo).
    if (requestMsg.replyTo != null) {
        val failure = createMessage({
            bounce: false,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnFailure {
                queryId: requestMsg.queryId,
                errorCode: TokenPool_errorCode(TokenPool_Error.UnsupportedOperation),
            },
        });
        failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Resumes the ReleaseOrMint flow after the advanced hooks confirmed the postflight check.
/// @dev Rate limit was already consumed before the hook check; no need to consume again.
fun TokenPool<T>.onPostflightCheckFinished(
    mutate self,
    sender: address,
    msg: TokenPool_PostflightCheckFinished,
): void {
    val fwdp = msg.forwardPayload.load();
    val originalSender = fwdp.originalSender;
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    // Continue with mint/release + finalize.
    self.onReleaseOrMintContinue(originalSender, requestMsg, prepared);
}

/// Handles postflight check failure from advanced hooks: refund rate limit + propagate error.
/// @dev Rate limit was consumed before the hook check; refund it here on hook rejection.
fun TokenPool<T>.onPostflightCheckFailed(
    mutate self,
    sender: address,
    msg: TokenPool_PostflightCheckFailed,
): void {
    val fwdp = msg.forwardPayload.load();
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    // Refund inbound rate limit that was consumed before the hook check.
    val request = requestMsg.request.load();
    val details = request.transfer.details.load();
    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        self.releaseFastFinalityInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    } else {
        self.releaseInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    }

    // Send failure response back to the executor (replyTo).
    if (requestMsg.replyTo != null) {
        val failure = createMessage({
            bounce: false, // TODO: ?
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_ReleaseOrMintFailure {
                queryId: requestMsg.queryId,
                errorCode: TokenPool_errorCode(TokenPool_Error.UnsupportedOperation),
            },
        });
        failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Updates the token transfer fee configurations for specified destination chains.
/// @param updates Array of structs containing destination chain selectors and their fee configs.
/// @param disableChainSelectors Array of destination chain selectors to disable custom fee configs for.
fun TokenPool<T>.applyTokenTransferFeeConfigUpdates(
    mutate self,
    sender: address,
    queryId: uint64,
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>,
    disableChainSelectors: SnakedCell<uint64>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);

    var iter = updates.iter();
    while (!iter.empty()) {
        val update = iter.next();
        assert(self.isSupportedChain(update.destChainSelector), TokenPool_Error.NonExistentChain);

        // Reject configs with isEnabled: false - use disableChainSelectors parameter instead.
        assert(update.tokenTransferFeeConfig.isEnabled, TokenPool_Error.InvalidTokenTransferFeeConfig);
        assert((update.tokenTransferFeeConfig.finalityTransferFeeBps as uint256) < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        assert((update.tokenTransferFeeConfig.fastFinalityTransferFeeBps as uint256) < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        // Gas overhead must be non-zero for proper fee accounting.
        assert(update.tokenTransferFeeConfig.destGasOverhead > 0, TokenPool_Error.InvalidTokenTransferFeeConfig);

        self.data.tokenTransferFeeConfigs.set(update.destChainSelector, update.tokenTransferFeeConfig);
        emit(TOPIC_TOKEN_POOL_FEE_CONFIG_UPDATED, TokenPool_TokenTransferFeeConfigUpdated {
            destChainSelector: update.destChainSelector,
            tokenTransferFeeConfig: update.tokenTransferFeeConfig.toCell(),
        });
    }

    var disableIter = disableChainSelectors.iter();
    while (!disableIter.empty()) {
        val destChainSelector = disableIter.next();
        self.data.tokenTransferFeeConfigs.delete(destChainSelector);
        emit(TOPIC_TOKEN_POOL_FEE_CONFIG_DELETED, TokenPool_TokenTransferFeeConfigDeleted { destChainSelector});
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_FeeConfigApplied { queryId },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.getTokenTransferFeeConfig(self, destChainSelector: uint64): TokenPool_TokenTransferFeeConfig? {
    val entry = self.data.tokenTransferFeeConfigs.get(destChainSelector);
    return entry.isFound ? entry.loadValue() : null;
}

/// Returns the pool fee parameters that will apply to a transfer.
/// @param destChainSelector The destination lane selector.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
fun TokenPool<T>.getFee(
    self,
    _localToken: address,
    destChainSelector: uint64,
    _amount: uint256,
    _feeToken: address,
    requestedFinalityConfig: uint32,
    _tokenArgs: cell?,
): (uint256, uint32, uint32, uint16, bool) {
    TokenPool_ensureRequestedFinalityAllowed(requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);

    val entry = self.data.tokenTransferFeeConfigs.get(destChainSelector);
    if (!entry.isFound) {
        return (0, 0, 0, 0, false);
    }

    val feeConfig = entry.loadValue();
    // If config is disabled, return zeros with isEnabled=false to signal OnRamp to use FeeQuoter defaults.
    if (!feeConfig.isEnabled) {
        return (0, 0, 0, 0, false);
    }

    if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return (
            feeConfig.fastFinalityFeeUSDCents,
            feeConfig.destGasOverhead,
            feeConfig.destBytesOverhead,
            feeConfig.fastFinalityTransferFeeBps,
            true,
        );
    }

    return (
        feeConfig.finalityFeeUSDCents,
        feeConfig.destGasOverhead,
        feeConfig.destBytesOverhead,
        feeConfig.finalityTransferFeeBps,
        true,
    );
}

/// @dev Calculates the fee based on the transferred amount, and the configured basis points.
/// @param lockOrBurnIn The original lock or burn request.
/// @param requestedFinalityConfig The requested finality encoding (see `FinalityCodec`).
/// A value of zero (FinalityCodec.WAIT_FOR_FINALITY_FLAG) applies default finality fees.
/// Returns the fee amount.
fun TokenPool<T>.getFeeAmount(
    self,
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): uint256 {
    // TODO: register as an available hook
    val details = lazy transfer.details.load();
    val entry = self.data.tokenTransferFeeConfigs.get(details.remoteChainSelector);
    if (!entry.isFound) {
        return 0;
    }

    val feeConfig = entry.loadValue();
    if (!feeConfig.isEnabled) {
        return 0;
    }

    if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return (details.amount * (feeConfig.fastFinalityTransferFeeBps as uint256)) / TOKEN_POOL_BPS_DIVIDER;
    }

    return (details.amount * (feeConfig.finalityTransferFeeBps as uint256)) / TOKEN_POOL_BPS_DIVIDER;
}

/// Validates the lock or burn input for correctness on
/// - token to be locked or burned
/// - RMN curse status
/// - if the sender is a valid onRamp
/// - rate limiting for either default or FTF transfer messages.
/// - preflight checks hooks (if enabled)
/// @param msg The full LockOrBurn message containing all request fields.
/// @dev This function should always be called before executing a lock or burn. Not doing so would allow
/// for various exploits.
fun TokenPool<T>.validateLockOrBurn(
    mutate self,
    sender: address,
    msg: TokenPool_LockOrBurn,
): (bool, TokenPool_LockOrBurnPrepared) {
    if (self.hooks != null && self.hooks.validateLockOrBurn != null) {
        val (newContext, wait, prepared)
            = self.hooks.validateLockOrBurn(self.context!, sender, msg);
        self.context = newContext;

        return (wait, prepared);
    }

    val request = msg.request.load();
    val details = lazy request.transfer.details.load();
    assert(self.isSupportedToken(details.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(details.remoteChainSelector);
    self.ensureNotCursed(details.remoteChainSelector);
    self.ensureOutboundAccess(sender, details.remoteChainSelector);

    val feeAmount = self.getFeeAmount(request.transfer, msg.requestedFinalityConfig);
    val destTokenAmount = details.amount - feeAmount;
    // Consume rate limit BEFORE hook check — _consume throws BucketOverfilled
    // designed to bounce to the original sender, not to the hooks contract.
    if (msg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        TokenPool_ensureRequestedFinalityAllowed(msg.requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);
        self.consumeFastFinalityOutboundRateLimit(details.remoteChainSelector, destTokenAmount);
    } else {
        self.consumeOutboundRateLimit(details.remoteChainSelector, destTokenAmount);
    }

    // Build prepared data (out contains destTokenAddress + destPoolData needed by destination chain).
    val prepared = TokenPool_LockOrBurnPrepared {
        feeAmount,
        destTokenAmount,
        out: TokenPool_LockOrBurnOutV1 {
            destTokenAddress: self.getRemoteToken(details.remoteChainSelector),
            destPoolData: self.encodeLocalDecimals(),
        },
    };

    // Build forward payload using the original message (no reconstruction needed).
    val fwdPayload = TokenPool_LockOrBurnForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val wait = self.preflightCheck(sender, msg, fwdPayload);
    return (wait, prepared);
}

fun TokenPool<T>.onLockOrBurn(
    mutate self,
    sender: address,
    msg: TokenPool_LockOrBurn,
): void {
    if (self.hooks != null && self.hooks.onLockOrBurn != null) {
        self.context = self.hooks.onLockOrBurn(self.context!, sender, msg);

        return;
    }

    // TODO: get actual transfer initiator (msg.request.originalSender)
    val transferInitiator = sender; // TODO: fixme

    // Validate and call preflightCheck with full message.
    val (wait, prepared) = self.validateLockOrBurn(transferInitiator, msg);

    if (wait) {
        return; // Async hook was triggered; will resume via onPreflightCheckFinished/Failed.
    }

    self.onLockOrBurnWithdraw(transferInitiator, msg, prepared);
}

fun TokenPool<T>.onLockOrBurnWithdraw(
    mutate self,
    sender: address,
    msg: TokenPool_LockOrBurn,
    prepared: TokenPool_LockOrBurnPrepared,
): void {
    // TODO: expose as a hook
    val withdrawalMsg = createMessage({
        bounce: true,
        value: 0,
        dest: msg.replyTo!, // should always be set as msg Executor
        body: TokenPool_LockOrBurnWithdraw {
            queryId: msg.queryId,
            forwardPayload: TokenPool_LockOrBurnForwardPayload {
                originalSender: sender,
                requestMsg: msg.toCell(),
                prepared: prepared.toCell(),
            },
        },
    });
    withdrawalMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Contains the specific lock or burn token logic for a pool.
/// @dev overriding this method allows us to create pools with different lock/burn signatures
/// without duplicating the underlying logic.
fun TokenPool<T>.onLockOrBurnTransfer(
    mutate self,
    sender: address,
    msg: TransferNotificationForRecipient,
): void {
    if (self.hooks != null && self.hooks.onLockOrBurnTransfer != null) {
        self.context = self.hooks.onLockOrBurnTransfer(self.context!, sender, msg);
    }

    // Check the notification originates from a valid Jetton wallet
    assert(self.data.jettonClient().isWallet(sender), TokenPool_Error.Unauthorized);

    // We either get this transfer from the Router, in which case we trust the transfer is valid;
    // Or for a different sender (e.g., per-user deposit account), we need to validate the transfer,
    // which we can only do with context -> recover from ContextExecutor.
    // 
    // The context contains info about the sender, the amount, etc. that we can use to validate the transfer.
    // If we can't validate the transfer, we try to return the funds.

    // TODO: check message value is enough to cover full flow, or error
    val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
    if (fwdps == null) {
        self.returnTransfer(sender, msg);
        return;
    }
    val fwdp = TokenPool_LockOrBurnForwardPayload.fromSlice(fwdps!);

    // TODO: can we trust (any) JettonWallet forward payloads?
    // assert(request.amount == msg.jettonAmount, TokenPool_Error.AmountMismatch);

    // Continue if transfer initiator is the Router, otherwise try to validate the transfer
    val router = self.data.adminConfig.load().dynamicConfig.load().router;
    // TODO: should check if transferInitiator == walletAddress(router) - missing info for now
    // if (msg.transferInitiator != null && msg.transferInitiator! == router) {
    if (msg.transferInitiator != null) {
        self.onLockOrBurnTransferContinue(sender, fwdp);
        return;
    }

    // TODO: should throw as unsupported for now
    // TODO: check if this is a registered deposit account
    // ContextExecutor_Ask(fwdp: msg + fwdp) -> ContextExecutor_Reply(ctx, fwdp)
    // if reply is valid, continue, else return transfer
}

fun TokenPool<T>.onLockOrBurnTransferContinue(
    mutate self,
    sender: address,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    if (self.hooks != null && self.hooks.onLockOrBurnTransferContinue != null) {
        self.context = self.hooks.onLockOrBurnTransferContinue(self.context!, sender, fwdPayload);

        return;
    }

    return self.onLockOrBurnTransferFinalize(fwdPayload);
}

fun TokenPool<T>.returnTransfer(self, sender: address, msg: TransferNotificationForRecipient): void {
    // TODO: check available gas, we don't want to drain the contract with return transfers
    // send back the tokens, we don't support direct transfers to the pool
    val returnTransfer = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender, // the wallet we own which sent us the notification
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.jettonAmount,
            transferRecipient: msg.transferInitiator!,
            sendExcessesTo: msg.transferInitiator,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    returnTransfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun TokenPool<T>.onLockOrBurnTransferFinalize(
    mutate self,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();

    val request = requestMsg.request.load();
    val details = request.transfer.details.load();
    emit(TOPIC_TOKEN_POOL_LOCKED_OR_BURNED, TokenPool_LockedOrBurned {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_LockedOrBurnedDetails {
            token: details.localToken,
            sender: fwdPayload.originalSender,
            amount: prepared.destTokenAmount,
        }.toCell(),
    });

    // TODO: we should reply in any case, send a message to the OnRamp to indicate that the lockOrBurn was processed
    if (requestMsg.replyTo != null) {
        val finished = createMessage({
            bounce: true,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnFinished {
                queryId: requestMsg.queryId,
                out: prepared.out.toCell(),
                destTokenAmount: prepared.destTokenAmount,
            },
        });
        finished.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Validates the release or mint input and calls postflightCheck.
/// @param msg The full ReleaseOrMint message containing all request fields.
fun TokenPool<T>.validateReleaseOrMint(
    mutate self,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
): (bool, TokenPool_ReleaseOrMintPrepared) {
    if (self.hooks != null && self.hooks.validateReleaseOrMint != null) {
        val (newContext, wait, prepared)
            = self.hooks.validateReleaseOrMint(self.context!, sender, msg);
        self.context = newContext;

        return (wait, prepared);
    }

    val request = msg.request.load();
    val details = request.transfer.details.load();
    assert(self.isSupportedToken(details.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(details.remoteChainSelector);
    self.ensureNotCursed(details.remoteChainSelector);
    self.ensureInboundAccess(sender, details.remoteChainSelector);
    assert(self.isRemotePool(details.remoteChainSelector, request.sourcePoolAddress), TokenPool_Error.InvalidRemotePoolForChain);

    val remoteDecimals = self.parseRemoteDecimals(request.sourcePoolData);
    val localAmount = self.calculateLocalAmount(details.amount, remoteDecimals);

    // Consume rate limit BEFORE hook check — _consume throws BucketOverfilled
    // designed to bounce to the original sender, not to the hooks contract.
    if (msg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        TokenPool_ensureRequestedFinalityAllowed(msg.requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);
        self.consumeFastFinalityInboundRateLimit(details.remoteChainSelector, localAmount);
    } else {
        self.consumeInboundRateLimit(details.remoteChainSelector, localAmount);
    }

    // Build prepared data.
    val prepared = TokenPool_ReleaseOrMintPrepared {
        requestedFinalityConfig: msg.requestedFinalityConfig,
        localAmount,
        out: TokenPool_ReleaseOrMintOutV1 {
            destinationAmount: localAmount,
        },
    };

    // Build forward payload using the original message (no reconstruction needed).
    val fwdPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val wait = self.postflightCheck(sender, msg, fwdPayload);
    return (wait, prepared);
}

fun TokenPool<T>.onReleaseOrMint(
    mutate self,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
): void {
    if (self.hooks != null && self.hooks.onReleaseOrMint != null) {
        self.context = self.hooks.onReleaseOrMint(self.context!, msg);
    }

    // Validate and call postflightCheck with full message.
    val (wait, prepared) = self.validateReleaseOrMint(sender, msg);

    if (wait) {
        return; // Async hook was triggered; will resume via onPostflightCheckFinished/Failed.
    }

    self.onReleaseOrMintContinue(sender, msg, prepared);
}

fun TokenPool<T>.onReleaseOrMintContinue(
    mutate self,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): void {
    if (self.hooks != null && self.hooks.onReleaseOrMintContinue != null) {
        self.context = self.hooks.onReleaseOrMintContinue(self.context, sender, msg, prepared);
        return;
    }

    self.onReleaseOrMintFinalize(sender, msg, prepared);
}

/// Finalizes the ReleaseOrMint flow: emits event and sends success notification.
fun TokenPool<T>.onReleaseOrMintFinalize(
    self,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): void {
    val request = msg.request.load();
    val details = request.transfer.details.load();
    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: details.localToken,
            sender: sender,
            amount: prepared.localAmount,
            recipient: details.receiver.toCell(),
        }.toCell(),
    });

    // Notify the caller (executor) that the release or mint succeeded.
    if (msg.replyTo != null) {
        val finished = createMessage({
            bounce: true,
            value: 0,
            dest: msg.replyTo!,
            body: TokenPool_ReleaseOrMintFinished {
                queryId: msg.queryId,
                out: prepared.out.toCell(),
            },
        });
        finished.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun TokenPool<T>.encodeLocalDecimals(self): cell {
    return beginCell().storeUint(self.data.tokenDecimals as uint256, 256).endCell();
}

fun TokenPool<T>.parseRemoteDecimals(self, sourcePoolData: cell?): uint8 {
    // Fallback to the local token decimals if the source pool data is empty. This allows for backwards compatibility.
    if (sourcePoolData == null) {
        return self.data.tokenDecimals;
    }

    var s = sourcePoolData!.beginParse();
    assert(s.remainingBitsCount() == 256 && s.remainingRefsCount() == 0, TokenPool_Error.InvalidRemoteChainDecimals);
    val remoteDecimals = s.loadUint(256);
    s.assertEnd();
    assert(remoteDecimals <= MAX_UINT8, TokenPool_Error.InvalidRemoteChainDecimals);

    return remoteDecimals as uint8;
}

  /// Calculates the local amount based on the remote amount and decimals.
  /// @param remoteAmount The amount on the remote chain.
  /// @param remoteDecimals The decimals of the token on the remote chain.
  /// @return The local amount.
  /// @dev This function protects against overflows. If there is a transaction that hits the overflow check, it is
  /// probably incorrect as that means the amount cannot be represented on this chain. If the local decimals have been
  /// wrongly configured, the token issuer could redeploy the pool with the correct decimals and manually re-execute the
  /// CCIP tx to fix the issue.
fun TokenPool<T>.calculateLocalAmount(self, remoteAmount: uint256, remoteDecimals: uint8): uint256 {
    if (remoteDecimals == self.data.tokenDecimals) {
        return remoteAmount;
    }

    if (remoteDecimals > self.data.tokenDecimals) {
        val decimalsDiff = remoteDecimals - self.data.tokenDecimals;
        // This is a safety check to prevent overflow in the next calculation.
        assert(decimalsDiff <= MAX_EXP10, TokenPool_Error.OverflowDetected);

        return remoteAmount / pow10(decimalsDiff);
    }

    // This is a safety check to prevent overflow in the next calculation.
    // More than 77 would never fit in a uint256 and would cause an overflow.
    // We also check if the resulting amount would overflow.
    val decimalsDiff = self.data.tokenDecimals - remoteDecimals;
    assert(decimalsDiff <= MAX_EXP10, TokenPool_Error.OverflowDetected);
    val scale = pow10(decimalsDiff);
    assert(scale == 0 || remoteAmount <= MAX_UINT256 / scale, TokenPool_Error.OverflowDetected);
 
    return remoteAmount * scale;
}

fun TokenPool<T>.requireSupportedChain(self, remoteChainSelector: uint64) {
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.ChainNotAllowed);
}

/// Checks whether the msg.sender is either the owner or the rate limit admin.
fun TokenPool<T>.onlyOwnerOrRateLimitAdmin(self, sender: address) {
    val adminConfig = self.data.adminConfig.load();
    val dynamicConfig = adminConfig.dynamicConfig.load();
    val ownable = adminConfig.ownable.load();
    val senderIsRateLimitAdmin = fun () {
        return dynamicConfig.rateLimitAdmin != null
            && sender == dynamicConfig.rateLimitAdmin;
    };
    assert(
        sender == ownable.owner || senderIsRateLimitAdmin(),
        TokenPool_Error.Unauthorized
    );
}

/// Checks whether the msg.sender is either the owner or the RMN proxy.
fun TokenPool<T>.onlyOwnerOrRMNProxy(self, sender: address) {
    val adminConfig = self.data.adminConfig.load();
    val ownable = adminConfig.ownable.load();
    assert(
        sender == ownable.owner || sender == adminConfig.rmnProxy,
        TokenPool_Error.Unauthorized
    );
}

fun TokenPool<T>.ensureNotCursed(self, remoteChainSelector: uint64) {
    if (self.hooks != null && self.hooks.ensureNotCursed != null) {
        return self.hooks.ensureNotCursed(self.context, remoteChainSelector);
    }
    assert(self.verifyNotCursed(remoteChainSelector as uint128), TokenPool_Error.CursedByRMN);
}

fun TokenPool<T>.ensureOutboundAccess(self, sender: address, remoteChainSelector: uint64) {
    val onRamp = self.getOnRamp(remoteChainSelector);
    assert(onRamp != null, TokenPool_Error.Unauthorized);
    assert(onRamp! == sender, TokenPool_Error.Unauthorized);
    if (self.hooks != null && self.hooks.ensureOutboundAccess != null) {
        self.hooks.ensureOutboundAccess(self.context, sender, remoteChainSelector);
    }
}

fun TokenPool<T>.ensureInboundAccess(self, sender: address, remoteChainSelector: uint64) {
    val offRamp = self.getOffRamp(remoteChainSelector);
    assert(offRamp != null, TokenPool_Error.Unauthorized);
    assert(offRamp! == sender, TokenPool_Error.Unauthorized);
    if (self.hooks != null && self.hooks.ensureInboundAccess != null) {
        self.hooks.ensureInboundAccess(self.context, sender, remoteChainSelector);
    }
}

fun TokenPool<T>.preflightCheck(
    self,
    sender: address,
    msg: TokenPool_LockOrBurn,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): bool {
    // Check inline hooks first (synchronous path).
    if (self.hooks != null && self.hooks.preflightCheck != null) {
        return self.hooks.preflightCheck(self.context, msg, fwdPayload);
    }

    // Check if on-chain async hooks are configured.
    val hooks = self.data.adminConfig.load().advancedPoolHooks;
    if (hooks != null) {
        // amountPostFee is already computed in fwdPayload.prepared.destTokenAmount.
        val prepared = fwdPayload.prepared.load();

        // Send async preflight check to hooks with replyPayload for callback resumption.
        val hooksMsg = createMessage({
            bounce: BounceMode.RichBounce,
            value: 0,
            dest: hooks!,
            body: TokenPool_PreflightCheck {
                queryId: msg.queryId,
                request: msg.request,
                requestedFinalityConfig: msg.requestedFinalityConfig,
                tokenArgs: msg.tokenArgs,
                amountPostFee: prepared.destTokenAmount,
                replyTo: contract.getAddress(),
                replyPayload: fwdPayload.toCell(),
            },
        });
        hooksMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

        return true; // wait for async callback
    }

    return false; // no hooks configured
}

fun TokenPool<T>.postflightCheck(
    self,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    fwdPayload: TokenPool_ReleaseOrMintForwardPayload,
): bool {
    // Check inline hooks first (synchronous path).
    if (self.hooks != null && self.hooks.postflightCheck != null) {
        return self.hooks.postflightCheck(self.context, msg, fwdPayload);
    }

    // Check if on-chain async hooks are configured.
    val hooks = self.data.adminConfig.load().advancedPoolHooks;
    if (hooks != null) {
        // localAmount is already computed in fwdPayload.prepared.localAmount.
        val prepared = fwdPayload.prepared.load();

        // Send async postflight check to hooks with replyPayload for callback resumption.
        val hooksMsg = createMessage({
            bounce: BounceMode.RichBounce,
            value: 0,
            dest: hooks!,
            body: TokenPool_PostflightCheck {
                queryId: msg.queryId,
                request: msg.request,
                localAmount: prepared.localAmount,
                requestedFinalityConfig: msg.requestedFinalityConfig,
                replyTo: contract.getAddress(),
                replyPayload: fwdPayload.toCell(),
            },
        });
        hooksMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

        return true; // wait for async callback
    }

    return false; // no hooks configured
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

/// Consumes outbound rate limiting capacity in this pool.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.outbound.load();
    bucket._consume(amount, self.data.token());
    rateLimiters.outbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_OUTBOUND_RATE_LIMIT_CONSUMED, TokenPool_OutboundRateLimitConsumed {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Consumes inbound rate limiting capacity in this pool.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket._consume(amount, self.data.token());
    rateLimiters.inbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_INBOUND_RATE_LIMIT_CONSUMED, TokenPool_InboundRateLimitConsumed {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Returns previously consumed outbound capacity to the bucket when an outbound operation
/// fails after admission (e.g. a lock/burn flow bounces). Mirrors `consumeOutboundRateLimit`.
/// @dev Fast-finality refunds require the requested finality to be recovered from the
/// pending operation; deferred until FTF is enabled (see TON-TP/16).
fun TokenPool<T>.releaseOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.outbound.load();
    bucket._refund(amount, self.data.token());
    rateLimiters.outbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_OUTBOUND_RATE_LIMIT_REFUNDED, TokenPool_OutboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Returns previously consumed inbound capacity to the bucket when an inbound operation
/// fails after admission (e.g. a release transfer bounces). Mirrors `consumeInboundRateLimit`.
/// @dev Fast-finality refunds require the requested finality to be recovered from the
/// pending operation; deferred until FTF is enabled (see TON-TP/16).
fun TokenPool<T>.releaseInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket._refund(amount, self.data.token());
    rateLimiters.inbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_INBOUND_RATE_LIMIT_REFUNDED, TokenPool_InboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Returns previously consumed fast-finality outbound capacity to the bucket.
/// Mirrors `consumeFastFinalityOutboundRateLimit` (falls back to default bucket if FTF is disabled).
fun TokenPool<T>.releaseFastFinalityOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.outbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.outbound.load();
        bucket._refund(amount, self.data.token());
        rateLimiters.outbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._refund(amount, self.data.token());
        fastRateLimiters.outbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_OUTBOUND_RATE_LIMIT_REFUNDED, TokenPool_FastFinalityOutboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Returns previously consumed fast-finality inbound capacity to the bucket.
/// Mirrors `consumeFastFinalityInboundRateLimit` (falls back to default bucket if FTF is disabled).
fun TokenPool<T>.releaseFastFinalityInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.inbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.inbound.load();
        bucket._refund(amount, self.data.token());
        rateLimiters.inbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._refund(amount, self.data.token());
        fastRateLimiters.inbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_INBOUND_RATE_LIMIT_REFUNDED, TokenPool_FastFinalityInboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Consumes fast finality outbound rate limiting capacity in this pool.
/// @dev If fast finality rate limiter is not enabled for the chain, it will fallback to the default
/// rate limiter.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeFastFinalityOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.outbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.outbound.load();
        bucket._consume(amount, self.data.token());
        rateLimiters.outbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._consume(amount, self.data.token());
        fastRateLimiters.outbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_OUTBOUND_RATE_LIMIT_CONSUMED, TokenPool_FastFinalityOutboundRateLimitConsumed {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Consumes fast finality inbound rate limiting capacity in this pool.
/// @dev If fast finality rate limiter is not enabled for the chain, it will fallback to the default
/// rate limiter.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeFastFinalityInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.inbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.inbound.load();
        bucket._consume(amount, self.data.token());
        rateLimiters.inbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._consume(amount, self.data.token());
        fastRateLimiters.inbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_INBOUND_RATE_LIMIT_CONSUMED, TokenPool_FastFinalityInboundRateLimitConsumed {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    });
}

/// Returns the outbound and inbound rate limiter state for the given remote chain at the time of the call.
/// @param remoteChainSelector The remote chain selector.
/// @param fastFinality Whether to get the fast finality rate limiter state.
fun TokenPool<T>.getCurrentRateLimiterState(
    self,
    remoteChainSelector: uint64,
    fastFinality: bool,
): TokenPool_RateLimiterPair {
    val config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    if (fastFinality) {
        val rateLimiters = config.fastFinalityRateLimiters.load();
        return TokenPool_RateLimiterPair {
            outbound: rateLimiters.outbound.load()._currentTokenBucketState().toCell(),
            inbound: rateLimiters.inbound.load()._currentTokenBucketState().toCell(),
        };
    }

    val rateLimiters = config.rateLimiters.load();
    return TokenPool_RateLimiterPair {
        outbound: rateLimiters.outbound.load()._currentTokenBucketState().toCell(),
        inbound: rateLimiters.inbound.load()._currentTokenBucketState().toCell(),
    };
}

/// Sets the rate limit configurations for specified remote chains.
/// @param rateLimitConfigArgs Array of structs containing remote chain selectors and their rate limiter configs.
fun TokenPool<T>.setRateLimitConfig(
    mutate self,
    sender: address,
    queryId: uint64,
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>,
) {
    self.onlyOwnerOrRateLimitAdmin(sender);

    var iter = updates.iter();
    while (!iter.empty()) {
        val update = iter.next();
        var config = self.data.remoteChainConfigs.mustGet(update.remoteChainSelector, TokenPool_Error.NonExistentChain as int);
        if (update.fastFinality) {
            var fastRateLimiters = config.fastFinalityRateLimiters.load();
            // TODO: use setter RateLimiter._setTokenBucketConfig
            fastRateLimiters.outbound = RateLimiter_TokenBucket.fromConfig(update.outboundRateLimiterConfig.load()).toCell();
            fastRateLimiters.inbound = RateLimiter_TokenBucket.fromConfig(update.inboundRateLimiterConfig.load()).toCell();
            config.fastFinalityRateLimiters = fastRateLimiters.toCell();
        } else {
            var rateLimiters = config.rateLimiters.load();
            // TODO: use setter RateLimiter._setTokenBucketConfig
            rateLimiters.outbound = RateLimiter_TokenBucket.fromConfig(update.outboundRateLimiterConfig.load()).toCell();
            rateLimiters.inbound = RateLimiter_TokenBucket.fromConfig(update.inboundRateLimiterConfig.load()).toCell();
            config.rateLimiters = rateLimiters.toCell();
        }
        self.data.remoteChainConfigs.set(update.remoteChainSelector, config);

        emit(TOPIC_TOKEN_POOL_RATE_LIMIT_CONFIGURED, TokenPool_RateLimitConfigured { args: update });
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_RateLimitConfiguredNotification { queryId },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Adds a pool address to the allowed remote token pools for a particular chain.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>._setRemotePool(
    mutate self,
    mutate config: TokenPool_RemoteChainConfig,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>
) {
    assert(!TokenPool_isEmptyCrossChainAddress(remotePoolAddress), TokenPool_Error.ZeroAddressInvalid);
    // Check if the pool already exists.
    val poolHash = remotePoolAddress.hash();
    assert(!config.remotePools.get(poolHash).isFound, TokenPool_Error.PoolAlreadyAdded);
    // Add the pool to the mapping to be able to un-hash it later.
    config.remotePools.set(poolHash, remotePoolAddress);

    emit(TOPIC_TOKEN_POOL_REMOTE_POOL_ADDED, TokenPool_RemotePoolAdded {
        remoteChainSelector,
        remotePoolAddress,
    });
}

// TODO: withdrawFeeTokens

fun TokenPool_ensureRequestedFinalityAllowed(requestedFinalityConfig: uint32, allowedFinalityConfig: uint32) {
    if (requestedFinalityConfig == TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return;
    }
    assert(allowedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG && requestedFinalityConfig == allowedFinalityConfig, TokenPool_Error.InvalidRequestedFinality);
}

fun TokenPool_isEmptyCrossChainAddress(value: Cell<CrossChainAddress>): bool {
    var cs = value.beginParse();
    val addressBytes = CrossChainAddress.unpackFromSlice(mutate cs);
    cs.assertEnd();
    return addressBytes.remainingBitsCount() == 0;
}

fun TokenPool_boxCrossChainAddress(addressBytes: CrossChainAddress): Cell<CrossChainAddress> {
    var addressSlice = addressBytes;
    val bits = addressSlice.remainingBitsCount();
    assert(bits % 8 == 0, TokenPool_Error.OverflowDetected);
    val pureAddressBits = addressSlice.loadBits(bits);
    return beginCell()
        .storeUint(bits / 8, 8)
        .storeSlice(pureAddressBits)
        .endCell() as Cell<CrossChainAddress>;
}
