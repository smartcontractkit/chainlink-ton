// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../../lib/utils"
import "../../lib/jetton/messages.tolk"
import "../../lib/access/ownable_2step.tolk"
import "../common/types"
import "../rmn_remote/lib"

import "types"
import "errors"
import "messages"
import "events"
import "rate_limiter"

struct TokenPool_AdminConfig {
    ownable: Cell<Ownable2Step>;
    rmnProxy: address;
    dynamicConfig: Cell<TokenPool_DynamicConfig>;
    allowedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY;
}

struct TokenPool_Data {
    adminConfig: Cell<TokenPool_AdminConfig>;
    mirroredPolicy: Cell<TokenPool_MirroredPolicy>;
    token: address;
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
    preflightCheck: ((T?, TokenPool_LockOrBurnInV1, uint32, cell?, uint256) -> void)?;
    postflightCheck: ((T?, TokenPool_ReleaseOrMintInV1, uint256, uint32) -> void)?;
    applyLockOrBurn: ((T?, TokenPool_LockOrBurnPrepared) -> void)?;
    applyReleaseOrMint: ((T?, TokenPool_ReleaseOrMintPrepared) -> void)?;
    handleReleaseOrMintMessage: ((T?, address, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintPrepared) -> T?)?;
}

struct TokenPool<T> {
    data: TokenPool_Data;
    context: T? = null;
    hooks: TokenPool_Hooks<T>? = null;
}

@inline
fun TokenPool<T>.load(context: T? = null, hooks: TokenPool_Hooks<T>? = null): TokenPool<T> {
    val data = TokenPool_Data.fromContractData();
    return TokenPool<T> { data, context, hooks };
}

fun TokenPool<T>.store(self) {
    self.data.storeAsContractData();
}

/// Returns if the token pool supports the given token.
/// @param token The address of the token.
@inline
fun TokenPool<T>.isSupportedToken(self, token: address): bool {
    return self.data.token == token;
}

/// Gets the Jetton token that this pool can lock or burn.
/// @return token The Jetton token representation.
@inline
fun TokenPool<T>.getToken(self): address {
    return self.data.token;
}

/// Gets the Jetton token decimals on the local chain.
@inline
fun TokenPool<T>.getTokenDecimals(self): uint8 {
    return self.data.tokenDecimals;
}

@inline
fun TokenPool<T>.getRmnProxy(self): address {
    return self.data.adminConfig.load().rmnProxy;
}

/// Gets the pools dynamic configuration.
@inline
fun TokenPool<T>.getDynamicConfig(self): TokenPool_DynamicConfig {
    return self.data.adminConfig.load().dynamicConfig.load();
}

/// Gets the finality config as defined in the FinalityCodec library. This value does NOT 1:1 translate to
/// a block depth. The finality config contains special flags and should only be encoded/decoded using the
/// FinalityCodec library. Checks must happen by calling `FinalityCodec._ensureRequestedFinalityAllowed`.
@inline
fun TokenPool<T>.getAllowedFinalityConfig(self): uint32 {
    return self.data.adminConfig.load().allowedFinalityConfig;
}

// TODO: implement me
/// Gets the advanced pool hook contract address used by this pool.
@inline
fun TokenPool<T>.getAdvancedPoolHooks(self): address? {
    return null;
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

/// Checks if the pool address is configured on the remote chain.
/// @param remoteChainSelector Remote chain selector.
/// @param remotePoolAddress The address of the remote pool.
fun TokenPool<T>.isRemotePool(self, remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    val entry = self.data.remoteChainConfigs.get(remoteChainSelector);
    if (!entry.isFound) {
        return false;
    }

    val config = entry.loadValue();
    return config.remotePools.get(TokenPool_hashCrossChainAddress(remotePoolAddress)).isFound;
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

    // TODO: reply back to sender with excess
    emit(TOKEN_POOL_DYNAMIC_CONFIG_SET_TOPIC, TokenPool_DynamicConfigSet {
        router,
        rateLimitAdmin,
        feeAdmin,
    });
}

/// Sets the finality config according to the FinalityCodec library encoding.
/// @param allowedFinality The finality settings allowed in this pool, according to the FinalityCodec encoding.  
fun TokenPool<T>.setAllowedFinalityConfig(mutate self, sender: address, allowedFinalityConfig: uint32) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);
    // Any bytes4 value is accepted as allowedFinality; the FinalityCodec semantics are enforced when requests are
    // checked against this value via FinalityCodec._ensureRequestedFinalityAllowed.
    adminConfig.allowedFinalityConfig = allowedFinalityConfig;
    self.data.adminConfig = adminConfig.toCell();

    // TODO: reply back to sender with excess
    emit(TOKEN_POOL_FINALITY_CONFIG_SET_TOPIC, TokenPool_FinalityConfigSet {
        allowedFinalityConfig,
    });
}

// TODO: add updateAdvancedPoolHooks

/// Adds a remote pool for a given chain selector. This could be due to a pool being upgraded on the remote
/// chain. We don't simply want to replace the old pool as there could still be valid inflight messages from the old
/// pool. This function allows for multiple pools to be added for a single chain selector.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>.addRemotePool(
    mutate self,
    sender: address,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.NonExistentChain);

    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    self._setRemotePool(mutate config, remotePoolAddress);
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: reply back to sender with excess
    emit(TOKEN_POOL_REMOTE_POOL_ADDED_TOPIC, TokenPool_RemotePoolAdded {
        remoteChainSelector,
        remotePoolAddress,
    });
}

/// Removes the remote pool address for a given chain selector.
/// @dev All inflight txs from the remote pool will be rejected after it is removed. To ensure no loss of funds, there
/// should be no inflight txs from the given pool.
/// @param remoteChainSelector The remote chain selector.
/// @param remotePoolAddress The remote pool address to remove.
fun TokenPool<T>.removeRemotePool(
    mutate self,
    sender: address,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.NonExistentChain);

    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    val deleted = config.remotePools.delete(TokenPool_hashCrossChainAddress(remotePoolAddress));
    assert(deleted, TokenPool_Error.InvalidRemotePoolForChain);
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: reply back to sender with excess
    emit(TOKEN_POOL_REMOTE_POOL_REMOVED_TOPIC, TokenPool_RemotePoolRemoved {
        remoteChainSelector,
        remotePoolAddress,
    });
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
    remoteChainSelectorsToRemove: SnakedCell<uint64>,
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);

    var rmIter = remoteChainSelectorsToRemove.iter();
    while (!rmIter.empty()) {
        val remoteChainSelector = rmIter.next();
        val deleted = self.data.remoteChainConfigs.delete(remoteChainSelector);
        assert(deleted, TokenPool_Error.NonExistentChain);

        emit(TOKEN_POOL_CHAIN_REMOVED_TOPIC, TokenPool_ChainRemoved { remoteChainSelector });
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
            self._setRemotePool(mutate config, remotePoolAddress);

            emit(TOKEN_POOL_REMOTE_POOL_ADDED_TOPIC, TokenPool_RemotePoolAdded {
                remoteChainSelector,
                remotePoolAddress,
            });
        }

        self.data.remoteChainConfigs.set(remoteChainSelector, config);

        emit(TOKEN_POOL_CHAIN_ADDED_TOPIC, TokenPool_ChainAdded {
            remoteChainSelector,
            remoteTokenAddress,
        });
    }

    // TODO: reply back to sender with excess
}

fun TokenPool<T>.applyRampAccessUpdates(
    mutate self,
    sender: address,
    updates: SnakedCell<TokenPool_RampUpdate>,
) {
    var adminConfig = self.data.adminConfig.load();
    var ownable = adminConfig.ownable.load();
    ownable.requireOwner(sender);
    adminConfig.ownable = ownable.toCell();
    self.data.adminConfig = adminConfig.toCell();

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

        emit(TOKEN_POOL_RAMP_ACCESS_UPDATED_TOPIC, TokenPool_RampAccessUpdated {
            remoteChainSelector: update.remoteChainSelector,
            onRamp: update.onRamp,
            offRamp: update.offRamp,
        });
    }

    self.data.mirroredPolicy = mirroredPolicy.toCell();
}

fun TokenPool<T>.setRMNProxy(mutate self, sender: address, rmnProxy: address) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    adminConfig.rmnProxy = rmnProxy;
    self.data.adminConfig = adminConfig.toCell();
}

fun TokenPool<T>.setCursedSubjects(
    mutate self,
    sender: address,
    cursedSubjects: CursedSubjects,
) {
    assert(sender == self.data.adminConfig.load().rmnProxy, TokenPool_Error.Unauthorized);

    var mirroredPolicy = self.data.mirroredPolicy.load();
    mirroredPolicy.cursedSubjects = cursedSubjects;
    self.data.mirroredPolicy = mirroredPolicy.toCell();

    emit(TOKEN_POOL_CURSED_SUBJECTS_UPDATED_TOPIC, TokenPool_CursedSubjectsUpdated {})}

fun TokenPool<T>.onInternalMessage(mutate self, msgSender: address, msgValue: coins, msgBody: slice): bool {
    val msg = lazy TokenPool_InMessage.fromSlice(msgBody);

    match (msg) {
        TokenPool_ApplyChainUpdates => {
            self.applyChainUpdates(msgSender, msg.remoteChainSelectorsToRemove, msg.chainsToAdd);
            return true;
        }
        TokenPool_AddRemotePool => {
            self.addRemotePool(msgSender, msg.remoteChainSelector, msg.remotePoolAddress);
            return true;
        }
        TokenPool_RemoveRemotePool => {
            self.removeRemotePool(msgSender, msg.remoteChainSelector, msg.remotePoolAddress);
            return true;
        }
        TokenPool_SetDynamicConfig => {
            self.setDynamicConfig(msgSender, msg.router, msg.rateLimitAdmin, msg.feeAdmin);
            return true;
        }
        TokenPool_SetAllowedFinalityConfig => {
            self.setAllowedFinalityConfig(msgSender, msg.allowedFinalityConfig);
            return true;
        }
        TokenPool_SetRateLimitConfig => {
            self.setRateLimitConfig(msgSender, msg.updates);
            return true;
        }
        TokenPool_ApplyTokenTransferFeeConfigUpdates => {
            self.applyTokenTransferFeeConfigUpdates(msgSender, msg.updates, msg.disableChainSelectors);
            return true;
        }
        TokenPool_UpdateRampAccess => {
            self.applyRampAccessUpdates(msgSender, msg.updates);
            return true;
        }
        TokenPool_SetRMNProxy => {
            self.setRMNProxy(msgSender, msg.rmnProxy);
            return true;
        }
        TokenPool_UpdateCursedSubjects => {
            self.setCursedSubjects(msgSender, msg.cursedSubjects);
            return true;
        }
        TokenPool_ReleaseOrMint => {
            val prepared = self.prepareReleaseOrMint(msgSender, msg.request.load(), msg.requestedFinalityConfig);
            assert(self.hooks != null && self.hooks.handleReleaseOrMintMessage != null, TokenPool_Error.UnsupportedOperation);
            self.context = self.hooks.handleReleaseOrMintMessage(self.context, msgSender, msg, prepared);
            return true;
        }
        TransferNotificationForRecipient => {
            return false; // TODO: handle me, should host fwdPayload = TokenPool_LockOrBurn
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
}

fun TokenPool<T>.applyTokenTransferFeeConfigUpdates(
    mutate self,
    sender: address,
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>,
    disableChainSelectors: SnakedCell<uint64>,
) {
    self.data.adminConfig.load().ownable.load().requireOwner(sender);

    var iter = updates.iter();
    while (!iter.empty()) {
        val update = iter.next();
        assert(self.isSupportedChain(update.destChainSelector), TokenPool_Error.NonExistentChain);
        assert(update.tokenTransferFeeConfig.isEnabled, TokenPool_Error.InvalidTokenTransferFeeConfig);
        assert((update.tokenTransferFeeConfig.finalityTransferFeeBps as uint256) < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        assert((update.tokenTransferFeeConfig.fastFinalityTransferFeeBps as uint256) < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        assert(update.tokenTransferFeeConfig.destGasOverhead > 0, TokenPool_Error.InvalidTokenTransferFeeConfig);
        self.data.tokenTransferFeeConfigs.set(update.destChainSelector, update.tokenTransferFeeConfig);
    }

    var disableIter = disableChainSelectors.iter();
    while (!disableIter.empty()) {
        self.data.tokenTransferFeeConfigs.delete(disableIter.next());
    }
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
    request: TokenPool_LockOrBurnInV1,
    requestedFinalityConfig: uint32,
): uint256 {
    val entry = self.data.tokenTransferFeeConfigs.get(request.remoteChainSelector);
    if (!entry.isFound) {
        return 0;
    }

    val feeConfig = entry.loadValue();
    if (!feeConfig.isEnabled) {
        return 0;
    }

    if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return (request.amount * (feeConfig.fastFinalityTransferFeeBps as uint256)) / TOKEN_POOL_BPS_DIVIDER;
    }

    return (request.amount * (feeConfig.finalityTransferFeeBps as uint256)) / TOKEN_POOL_BPS_DIVIDER;
}

fun TokenPool<T>.prepareLockOrBurn(
    mutate self,
    sender: address,
    request: TokenPool_LockOrBurnInV1,
    requestedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY,
    tokenArgs: cell? = null,
): TokenPool_LockOrBurnPrepared {
    assert(self.isSupportedToken(request.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(request.remoteChainSelector);
    self.ensureNotCursed(request.remoteChainSelector);
    self.ensureOutboundAccess(sender, request.remoteChainSelector);

    val feeAmount = self.getFeeAmount(request, requestedFinalityConfig);
    val destTokenAmount = request.amount - feeAmount;
    val usingFastFinality = requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG;
    if (usingFastFinality) {
        TokenPool_ensureRequestedFinalityAllowed(requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);
        self.consumeFastFinalityOutboundRateLimit(request.remoteChainSelector, destTokenAmount);
    } else {
        self.consumeOutboundRateLimit(request.remoteChainSelector, destTokenAmount);
    }

    self.preflightCheck(request, requestedFinalityConfig, tokenArgs, destTokenAmount);

    return TokenPool_LockOrBurnPrepared {
        request,
        requestedFinalityConfig,
        tokenArgs,
        feeAmount,
        destTokenAmount,
        usingFastFinality,
        out: TokenPool_LockOrBurnOutV1 {
            destTokenAddress: self.getRemoteToken(request.remoteChainSelector),
            destPoolData: self.encodeLocalDecimals(),
        },
    };
}

fun TokenPool<T>.lockOrBurn(
    mutate self,
    sender: address,
    request: TokenPool_LockOrBurnInV1,
    requestedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY,
    tokenArgs: cell? = null,
): TokenPool_LockOrBurnPrepared {
    val prepared = self.prepareLockOrBurn(sender, request, requestedFinalityConfig, tokenArgs);
    if (self.hooks != null && self.hooks.applyLockOrBurn != null) {
        self.hooks.applyLockOrBurn(self.context, prepared);
    }
    return prepared;
}

fun TokenPool<T>.prepareReleaseOrMint(
    mutate self,
    sender: address,
    request: TokenPool_ReleaseOrMintInV1,
    requestedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY,
): TokenPool_ReleaseOrMintPrepared {
    assert(self.isSupportedToken(request.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(request.remoteChainSelector);
    self.ensureNotCursed(request.remoteChainSelector);
    self.ensureInboundAccess(sender, request.remoteChainSelector);
    assert(self.isRemotePool(request.remoteChainSelector, request.sourcePoolAddress), TokenPool_Error.InvalidRemotePoolForChain);

    val remoteDecimals = self.parseRemoteDecimals(request.sourcePoolData);
    val localAmount = self.calculateLocalAmount(request.sourceDenominatedAmount, remoteDecimals);
    val usingFastFinality = requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG;
    if (usingFastFinality) {
        TokenPool_ensureRequestedFinalityAllowed(requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);
        self.consumeFastFinalityInboundRateLimit(request.remoteChainSelector, localAmount);
    } else {
        self.consumeInboundRateLimit(request.remoteChainSelector, localAmount);
    }

    self.postflightCheck(request, localAmount, requestedFinalityConfig);

    return TokenPool_ReleaseOrMintPrepared {
        request,
        requestedFinalityConfig,
        localAmount,
        usingFastFinality,
        out: TokenPool_ReleaseOrMintOutV1 {
            destinationAmount: localAmount,
        },
    };
}

fun TokenPool<T>.releaseOrMint(
    mutate self,
    sender: address,
    request: TokenPool_ReleaseOrMintInV1,
    requestedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY,
): TokenPool_ReleaseOrMintPrepared {
    val prepared = self.prepareReleaseOrMint(sender, request, requestedFinalityConfig);
    if (self.hooks != null && self.hooks.applyReleaseOrMint != null) {
        self.hooks.applyReleaseOrMint(self.context, prepared);
    }
    return prepared;
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
    assert(remoteDecimals <= TOKEN_POOL_MAX_UINT8, TokenPool_Error.InvalidRemoteChainDecimals);

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
        assert(decimalsDiff <= TOKEN_POOL_MAX_EXP10, TokenPool_Error.OverflowDetected);

        return remoteAmount / pow10(decimalsDiff);
    }

    // This is a safety check to prevent overflow in the next calculation.
    // More than 77 would never fit in a uint256 and would cause an overflow.
    // We also check if the resulting amount would overflow.
    val decimalsDiff = self.data.tokenDecimals - remoteDecimals;
    assert(decimalsDiff <= TOKEN_POOL_MAX_EXP10, TokenPool_Error.OverflowDetected);
    val scale = pow10(decimalsDiff);
    assert(scale == 0 || remoteAmount <= TOKEN_POOL_MAX_UINT256 / scale, TokenPool_Error.OverflowDetected);
 
    return remoteAmount * scale;
}

fun TokenPool<T>.requireSupportedChain(self, remoteChainSelector: uint64) {
    assert(self.isSupportedChain(remoteChainSelector), TokenPool_Error.ChainNotAllowed);
}

fun TokenPool<T>.requireOwnerOrRateLimitAdmin(self, sender: address) {
    val adminConfig = self.data.adminConfig.load();
    val ownable = adminConfig.ownable.load();
    if (sender == ownable.owner) {
        return;
    }
    val dynamicConfig = adminConfig.dynamicConfig.load();
    assert(dynamicConfig.rateLimitAdmin != null && sender == dynamicConfig.rateLimitAdmin, TokenPool_Error.Unauthorized);
}

fun TokenPool<T>.ensureNotCursed(self, remoteChainSelector: uint64) {
    assert(self.verifyNotCursed(remoteChainSelector as uint128), TokenPool_Error.CursedByRMN);
    if (self.hooks != null && self.hooks.ensureNotCursed != null) {
        self.hooks.ensureNotCursed(self.context, remoteChainSelector);
    }
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
    request: TokenPool_LockOrBurnInV1,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
    amountPostFee: uint256,
) {
    if (self.hooks != null && self.hooks.preflightCheck != null) {
        self.hooks.preflightCheck(self.context, request, requestedFinalityConfig, tokenArgs, amountPostFee);
    }
}

fun TokenPool<T>.postflightCheck(
    self,
    request: TokenPool_ReleaseOrMintInV1,
    localAmount: uint256,
    requestedFinalityConfig: uint32,
) {
    if (self.hooks != null && self.hooks.postflightCheck != null) {
        self.hooks.postflightCheck(self.context, request, localAmount, requestedFinalityConfig);
    }
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
    bucket._consume(amount, self.data.token);
    rateLimiters.outbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: emit event with updated rate limiter state
    // emit OutboundRateLimitConsumed({token: token, remoteChainSelector: remoteChainSelector, amount: amount});
}

/// Consumes inbound rate limiting capacity in this pool.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: uint256) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket._consume(amount, self.data.token);
    rateLimiters.inbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: emit event with updated rate limiter state
    // emit InboundRateLimitConsumed({token: token, remoteChainSelector: remoteChainSelector, amount: amount});
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
        bucket._consume(amount, self.data.token);
        rateLimiters.outbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._consume(amount, self.data.token);
        fastRateLimiters.outbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: emit event with updated rate limiter state
    //  emit FastFinalityOutboundRateLimitConsumed({token: token, remoteChainSelector: remoteChainSelector, amount: amount});
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
        bucket._consume(amount, self.data.token);
        rateLimiters.inbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket._consume(amount, self.data.token);
        fastRateLimiters.inbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    // TODO: emit event with updated rate limiter state
    //  emit FastFinalityInboundRateLimitConsumed({token: token, remoteChainSelector: remoteChainSelector, amount: amount});
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
        // TODO: recompute with _currentTokenBucketState
        return TokenPool_RateLimiterPair {
            outbound: rateLimiters.outbound,
            inbound: rateLimiters.inbound,
        };
    }

    val rateLimiters = config.rateLimiters.load();
    // TODO: recompute with _currentTokenBucketState
    return TokenPool_RateLimiterPair {
        outbound: rateLimiters.outbound,
        inbound: rateLimiters.inbound,
    };
}

/// Sets the rate limit configurations for specified remote chains.
/// @param rateLimitConfigArgs Array of structs containing remote chain selectors and their rate limiter configs.
fun TokenPool<T>.setRateLimitConfig(
    mutate self,
    sender: address,
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>,
) {
    self.requireOwnerOrRateLimitAdmin(sender);

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

        // TODO: emit event with updated rate limiter config
        // emit RateLimitConfigured(
        //     remoteChainSelector,
        //     configArgs.fastFinality,
        //     configArgs.outboundRateLimiterConfig,
        //     configArgs.inboundRateLimiterConfig
        // );
    }

    // TODO: reply back to sender with excess
}

/// Adds a pool address to the allowed remote token pools for a particular chain.
/// @param remoteChainSelector The remote chain selector for which the remote pool address is being added.
/// @param remotePoolAddress The address of the new remote pool.
fun TokenPool<T>._setRemotePool(mutate self, mutate config: TokenPool_RemoteChainConfig, remotePoolAddress: Cell<CrossChainAddress>) {
    assert(!TokenPool_isEmptyCrossChainAddress(remotePoolAddress), TokenPool_Error.ZeroAddressInvalid);
    val poolHash = TokenPool_hashCrossChainAddress(remotePoolAddress);
    assert(!config.remotePools.get(poolHash).isFound, TokenPool_Error.PoolAlreadyAdded);
    // Add the pool to the mapping to be able to un-hash it later.
    config.remotePools.set(poolHash, remotePoolAddress);
}

// TODO: withdrawFeeTokens

fun TokenPool_ensureRequestedFinalityAllowed(requestedFinalityConfig: uint32, allowedFinalityConfig: uint32) {
    if (requestedFinalityConfig == TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return;
    }
    assert(allowedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG && requestedFinalityConfig == allowedFinalityConfig, TokenPool_Error.InvalidRequestedFinality);
}

fun TokenPool_hashCrossChainAddress(value: Cell<CrossChainAddress>): uint256 {
    var cs = value.beginParse();
    val addressBytes = CrossChainAddress.unpackFromSlice(mutate cs);
    cs.assertEnd();
    return keccak256(beginCell().storeSlice(addressBytes));
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

// TODO: move to common utils library
// @dev Calculates 10^n for n <= 77 in O(log n). For n > 77, it would overflow uint256.
fun pow10(n: uint8): uint256 {
    var result: uint256 = 1;
    var base: uint256 = 10;

    while (n > 0) {
        if ((n & 1) == 1) {
            // Check for potential overflow before multiplication
            assert(result == 0 || base <= TOKEN_POOL_MAX_UINT256 / result, TokenPool_Error.OverflowDetected);
            result *= base;
        }
        base *= base;
        n >>= 1;
    }

    return result;
}
