// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"
import "@stdlib/gas-payments"

import "../../../../lib/math"
import "../../../../lib/utils"
import "../../../../lib/jetton/messages"
import "../../../../lib/jetton/jetton_client"
import "../../../../lib/jetton/jetton-utils"
import "../../../../lib/access/ownable_2step"
import "../../../../lib/deployable/namespace"
import "../../../../lib/funding/jetton_withdrawable"
import "../../../common/types"
import "../../../rmn_remote/lib"

import "types"
import "errors"
import "messages"
import "events"
import "../rate_limiter"

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
/// TON value needed to return Jettons after a recoverable transfer failure.
/// Any value left from the inbound notification is forwarded with the failure
/// notification after the pool's pre-message balance has been reserved.
const TokenPool_RETURN_TRANSFER_VALUE = ton("0.1");

struct TokenPool<T> {
    data: TokenPool_Data;
    context: T? = null;
    hooks: TokenPool_Hooks<T>? = null;
}

struct TokenPool_AdminConfig {
    ownable: Cell<Ownable2Step>;
    rmnProxy: address?;
    dynamicConfig: Cell<TokenPool_DynamicConfig>;
    /// The pool's Jetton identity (master + wallet code). Single source of truth used to
    /// derive and authenticate the pool's own wallet.
    jettonClient: JettonClient;
    /// Allowed finality config for fast finality transfers (see `FinalityCodec`).
    /// FinalityCodec.WAIT_FOR_FINALITY_FLAG means wait for finality.
    allowedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY;
    /// Optional advanced pool hooks contract for additional features like allowlists and CCV management.
    advancedPoolHooks: address? = null;
    /// Compiled code of the Deployable contract used to derive source-chain deposit accounts
    /// (e.g. OnRampAccount). Stored here (owner-only, immutable by design) so the pool can
    /// authenticate a deposit source purely by recomputing the account's deterministic address
    /// and its jetton wallet.
    /// @dev Upgrading this after flows are in-flight can break auth for older accounts; it is
    ///      intentionally part of admin (not dynamic) config.
    deployableCode: cell? = null;
}

struct TokenPool_Data {
    adminConfig: Cell<TokenPool_AdminConfig>;
    localPolicy: Cell<TokenPool_LocalPolicy>;
    tokenDecimals: uint8;
    remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig> = [];
    tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig> = [];
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

/// Optional extension points wired by concrete pools (e.g. lock/release) to customize the base
/// TokenPool behavior. Each field is the implementation of the corresponding hook, or `null` to
/// use the base behavior. Pools share a generic `T` = their per-call `context`, which flows
/// through every hook (`T?` when a hook may be invoked with no context, e.g. getters).
///
/// There are three hook families, mirroring the three flows:
/// - **Guards**: curse checks — override to add custom policy.
/// - **Operation hooks**: entry + validation + (pre/post)flight for the LockOrBurn and
///   ReleaseOrMint flows. Hooks returning a `TokenPool_*Prepared` may also signal `wait` to defer
///   execution to the on-chain (async) `advancedPoolHooks` contract.
/// - **Continuation hooks**: run after Jetton custody is settled, letting the pool track binding
///   side effects (e.g. lock/release accrues fees only on confirmed deposit).
///
/// The fee-withdrawal hook `onWithdrawFeeTokens` is a fourth, standalone extension point.
struct TokenPool_Hooks<T> {
    /// RMN curse guard for a remote lane.
    /// @param context     The pool `context` (nullable).
    /// @param remoteChainSelector The remote lane to check for a curse.
    /// @dev Base behavior: reverts if the lane's cursed subjects mark it cursed by RMN.
    ensureNotCursed: ((T?, uint64) -> void)?;

    // ----------------------------------------------------------------------
    // ReleaseOrMint flow (inbound)
    // ----------------------------------------------------------------------

    /// Runs before validation when an inbound `ReleaseOrMint` arrives.
    /// @param context     The current pool `context` (non-null).
    /// @param msg         The full inbound request.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: continues to `validateReleaseOrMint`.
    onReleaseOrMint: ((T, TokenPool_ReleaseOrMint) -> T)?;

    /// Validates an inbound request and prepares the release/mint.
    /// @param context     The pool `context` (non-null).
    /// @param sender      The msg.sender (must be the OffRamp).
    /// @param msg         The full inbound request.
    /// @return (newContext, wait, prepared); `wait` = `true` defers to the async postflight hook.
    /// @dev Base behavior: token/chain/curse/access/pool checks + inbound rate-limit consumption
    ///      and `postflightCheck`. Regarding rate limits, an override REPLACES the base checks,
    ///      so it must consume the inbound rate limit itself.
    validateReleaseOrMint: ((T, address, TokenPool_ReleaseOrMint) -> (T, bool, TokenPool_ReleaseOrMintPrepared))?;

    /// Async postflight gate: called once validation has consumed the rate limit.
    /// @param context    The pool `context` (nullable).
    /// @param msg        The full inbound request.
    /// @param fwdPayload Carries `requestMsg` + `prepared` for later resumption.
    /// @return `true` to wait for a `TokenPool_PostflightCheckFinished/Failed` callback from the
    ///         configured `advancedPoolHooks`; `false` to continue immediately.
    /// @dev Only checked when the pool has async hooks configured; a custom hook here and async
    ///      hooks are mutually exclusive (inline wins).
    postflightCheck: ((T?, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintForwardPayload) -> bool)?;

    /// Continuation after custody is confirmed and the base finalization path runs.
    /// @param context  The pool `context` (nullable).
    /// @param sender   The msg.sender of the original request.
    /// @param msg      The full inbound request.
    /// @param prepared The validated release/mint data.
    /// @return The (possibly mutated) context, or `null`.
    /// @dev Base behavior (`onReleaseOrMintFinalize`): emits `ReleasedOrMinted` + sends the
    ///      `ReleaseOrMintFinished` reply to the caller.
    onReleaseOrMintContinue: ((T?, address, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintPrepared) -> T?)?;

    // ----------------------------------------------------------------------
    // LockOrBurn flow (outbound)
    // ----------------------------------------------------------------------

    /// Runs before validation when an outbound `LockOrBurn` arrives.
    /// @param context     The pool `context` (non-null).
    /// @param sender      The msg.sender requesting the lock/burn.
    /// @param msg         The full outbound request.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: continues to `validateLockOrBurn` (sender = the transfer initiator).
    onLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> T)?;

    /// Validates an outbound request and prepares the lock/burn.
    /// @param context     The pool `context` (non-null).
    /// @param sender      The msg.sender requesting the lock/burn.
    /// @param msg         The full outbound request.
    /// @return (newContext, wait, prepared); `wait` = `true` defers to the async preflight hook.
    /// @dev Base behavior: token/chain/curse/access checks + outbound rate-limit consumption and
    ///      `preflightCheck`. Regarding rate limits, an override REPLACES the base checks, so it
    ///      must consume the outbound rate limit itself.
    validateLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> (T, bool, TokenPool_LockOrBurnPrepared))?;

    /// Async preflight gate: called once validation has consumed the rate limit.
    /// @param context    The pool `context` (nullable).
    /// @param msg        The full outbound request.
    /// @param fwdPayload Carries `requestMsg` + `prepared` for later resumption.
    /// @return `true` to wait for a `TokenPool_PreflightCheckFinished/Failed` callback from the
    ///         configured `advancedPoolHooks`; `false` to continue immediately.
    /// @dev Only checked when the pool has async hooks configured; a custom hook here and async
    ///      hooks are mutually exclusive (inline wins).
    preflightCheck: ((T?, TokenPool_LockOrBurn, TokenPool_LockOrBurnForwardPayload) -> bool)?;

    /// Entry on the Jetton transfer notification (after tokens reach the pool's wallet).
    /// @param context The pool `context` (non-null).
    /// @param sender  The pool's Jetton wallet that delivered the notification.
    /// @param msg     The decoded inbound `TransferNotificationForRecipient`.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: authenticates the wallet, decodes the forward payload, authenticates
    ///      the deposit initiator, then continues to `onLockOrBurnTransferContinue`.
    onLockOrBurnTransfer: ((T, address, TransferNotificationForRecipient) -> T)?;

    /// Continuation once deposit custody is authenticated and confirmed.
    /// @param context   The pool `context` (non-null).
    /// @param sender    The pool's Jetton wallet that delivered the notification.
    /// @param msg       The decoded inbound transfer notification.
    /// @param fwdPayload The original request + prepared data.
    /// @return The (possibly mutated) context.
    /// @dev Base behavior (`onLockOrBurnTransferFinalize`): emits `LockedOrBurned` + sends the
    ///      `LockOrBurnFinished` reply.
    onLockOrBurnTransferContinue: ((T, address, TransferNotificationForRecipient, TokenPool_LockOrBurnForwardPayload) -> T)?;

    // ----------------------------------------------------------------------
    // FeeWithdrawal flow (JettonWithdrawable)
    // ----------------------------------------------------------------------

    /// Withdraws accrued fee jettons from the pool's wallet.
    /// @param context  The pool `context` (nullable).
    /// @param sender   The withdrawal caller (owner or fee admin).
    /// @param msgValue The TON value on the inbound withdrawal message (must cover all asks + reserve).
    /// @param msg      The withdrawal request (wallet + `AskToTransfer` pairs).
    /// @return The (possibly mutated) context.
    /// @dev Base behavior: unbounded relay (cap = sum of requested amounts) by `onlyOwnerOrFeeAdmin`.
    onWithdrawFeeTokens: ((T?, address, coins, JettonWithdrawable_Withdraw) -> T?)?;
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
fun TokenPool<T>.getRmnProxy(self): address? {
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
fun TokenPool<T>.verifyNotCursed(self, subject: uint128): bool {
    return !self.data.localPolicy.load().cursedSubjects.isCursed(subject);
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

    assert(router != createAddressNone(), TokenPool_Error.ZeroAddressInvalid);
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

/// Sets the compiled Deployable code used to derive source-chain deposit accounts
/// (e.g. OnRampAccount). Combined with `dynamicConfig.allowedDepositNamespaces` + the Router
/// address, this lets the pool recompute and authenticate a deposit-account address.
/// @param deployableCode The compiled Deployable code, or `null` to disable account-derived deposits.
/// @dev Owner-only. Part of admin (not dynamic) config: upgrading after flows are in-flight can
///      break auth for previously-derived accounts (see `TokenPool_AdminConfig.deployableCode`).
fun TokenPool<T>.setDeployableCode(
    mutate self,
    sender: address,
    queryId: uint64,
    deployableCode: cell?,
) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    adminConfig.deployableCode = deployableCode;
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_DeployableCodeSet {
            queryId,
            deployableCode,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Sets the Deployables namespaces the pool accepts as source-chain deposit accounts.
/// @param allowedDepositNamespaces The full set of allowed namespaces (replaces any previous set).
/// @dev Owner-only. Part of dynamic config so it can be updated without pool redeployment.
fun TokenPool<T>.setAllowedDepositNamespaces(
    mutate self,
    sender: address,
    queryId: uint64,
    allowedDepositNamespaces: map<uint32, bool>,
) {
    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    var dynamicConfig = adminConfig.dynamicConfig.load();
    dynamicConfig.allowedDepositNamespaces = allowedDepositNamespaces;
    adminConfig.dynamicConfig = dynamicConfig.toCell();
    self.data.adminConfig = adminConfig.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_AllowedDepositNamespacesSet { queryId },
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

fun TokenPool<T>.setRMNProxy(
    mutate self,
    sender: address,
    queryId: uint64,
    rmnProxy: address?
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

    var localPolicy = self.data.localPolicy.load();
    localPolicy.cursedSubjects = cursedSubjects;
    self.data.localPolicy = localPolicy.toCell();

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
            self.onLockOrBurnTransfer(msgSender, msg, msgValue);
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
        TokenPool_GetCCVs => {
            self.onGetCCVs(msgSender, msg, null);
        }
        TokenPool_GetCCVsAndFees => {
            self.onGetCCVsAndFees(msgSender, msg);
        }
        TokenPool_QueryCCVsReply => {
            self.onQueryCCVsReply(msgSender, msg);
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
        TokenPool_SetDeployableCode => {
            self.setDeployableCode(msgSender, msg.queryId, msg.deployableCode);
        }
        TokenPool_SetAllowedDepositNamespaces => {
            self.setAllowedDepositNamespaces(msgSender, msg.queryId, msg.allowedDepositNamespaces);
        }
        TokenPool_SetRateLimitConfig => {
            self.setRateLimitConfig(msgSender, msg.queryId, msg.updates);
        }
        TokenPool_ApplyTokenTransferFeeConfigUpdates => {
            self.applyTokenTransferFeeConfigUpdates(msgSender, msg.queryId, msg.updates, msg.disableChainSelectors);
        }
        TokenPool_SetRMNProxy => {
            self.setRMNProxy(msgSender, msg.queryId, msg.rmnProxy);
        }
        TokenPool_SetCursedSubjects => {
            self.setCursedSubjects(msgSender, msg.queryId, msg.cursedSubjects);
        }
        JettonWithdrawable_Withdraw => {
            self.onWithdrawFeeTokensDispatch(msgSender, msgValue, msg);
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
    self.onlyAdvancedPoolHooks(sender);
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
    self.onlyAdvancedPoolHooks(sender);
    val fwdp = msg.forwardPayload.load();

    // Refund outbound rate limit that was consumed before the hook check.
    self.refundLockOrBurnRateLimit(fwdp);

    // Send failure response back to the executor (replyTo).
    self.sendLockOrBurnFailure(fwdp, TokenPool_Error.UnsupportedOperation as uint16);
}

/// Resumes the ReleaseOrMint flow after the advanced hooks confirmed the postflight check.
/// @dev Rate limit was already consumed before the hook check; no need to consume again.
fun TokenPool<T>.onPostflightCheckFinished(
    mutate self,
    sender: address,
    msg: TokenPool_PostflightCheckFinished,
): void {
    self.onlyAdvancedPoolHooks(sender);
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
    self.onlyAdvancedPoolHooks(sender);
    val fwdp = msg.forwardPayload.load();

    // Refund inbound rate limit that was consumed before the hook check.
    self.refundReleaseOrMintRateLimit(fwdp);

    // Send failure response back to the executor (replyTo).
    self.sendReleaseOrMintFailure(fwdp, TokenPool_Error.UnsupportedOperation as uint16);
}

// ================================================================
// │      Common notification & rate-limit refund helpers           │
// ================================================================

/// Sends `LockOrBurnFailure` reply to the executor (replyTo address) when an outbound
/// operation fails after admission.
/// @param forwardPayload The full forward payload carrying the original request message.
/// @param errorCode The pool-specific error code to attach to the failure message.
/// @dev Only sends a message if `replyTo` is set on the original request. Instance method
/// so concrete pools can override (e.g. reserve balance before sending).
fun TokenPool<T>.sendLockOrBurnFailure(
    self,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
    errorCode: uint16,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    if (requestMsg.replyTo != null) {
        val failure = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnFailure {
                queryId: requestMsg.queryId,
                errorCode,
            },
        });
        failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Emits `ReleasedOrMinted` event and sends `ReleaseOrMintFinished` reply to the executor
/// when an inbound operation completes successfully.
/// @param forwardPayload The full forward payload carrying the original request and prepared data.
/// @dev Event is always emitted. Reply message is only sent if `replyTo` is set. Instance method
/// so concrete pools can override (e.g. customize event or reply body).
fun TokenPool<T>.sendReleaseOrMintFinished(
    self,
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();

    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: details.localToken,
            sender: contract.getAddress(),
            amount: prepared.out.destinationAmount,
            recipient: details.receiver.toCell(),
        }.toCell(),
    });

    if (requestMsg.replyTo != null) {
        val notify = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_ReleaseOrMintFinished {
                queryId: requestMsg.queryId,
                out: prepared.out.toCell(),
            },
        });
        notify.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Sends `ReleaseOrMintFailure` reply to the executor (replyTo address) when an inbound
/// operation fails after admission.
/// @param forwardPayload The full forward payload carrying the original request message.
/// @param errorCode The pool-specific error code to attach to the failure message.
/// @dev Only sends a message if `replyTo` is set on the original request. Instance method
/// so concrete pools can override (e.g. reserve balance before sending).
fun TokenPool<T>.sendReleaseOrMintFailure(
    self,
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
    errorCode: uint16,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    if (requestMsg.replyTo != null) {
        val failure = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_ReleaseOrMintFailure {
                queryId: requestMsg.queryId,
                errorCode,
            },
        });
        failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

/// Refunds the outbound (or fast-finality outbound) rate limit capacity that was consumed
/// before a LockOrBurn operation when it later fails.
/// @param forwardPayload The forward payload carrying the original request and prepared data.
/// @dev Picks the correct rate limiter bucket based on the requested finality config.
fun TokenPool<T>.refundLockOrBurnRateLimit(
    mutate self,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();

    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        self.releaseFastFinalityOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    } else {
        self.releaseOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    }
}

/// Refunds the inbound (or fast-finality inbound) rate limit capacity that was consumed
/// before a ReleaseOrMint operation when it later fails.
/// @param forwardPayload The forward payload carrying the original request and prepared data.
/// @dev Picks the correct rate limiter bucket based on the requested finality config.
fun TokenPool<T>.refundReleaseOrMintRateLimit(
    mutate self,
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();

    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        self.releaseFastFinalityInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    } else {
        self.releaseInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
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

// TBD: should we put return value in a struct? For getters is the same, as they are returned in the stack, but it is much beter for readability
/// Returns the pool fee parameters that will apply to a transfer.
/// @param destChainSelector The destination lane selector.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
/// Returns a tuple of (finalityFeeInUSDCents, destGasOverhead, destBytesOverhead, finalityTransferFeeBps, isEnabled).
fun TokenPool<T>.getFee(
    self,
    _localToken: address,
    destChainSelector: uint64,
    _amount: coins,
    _feeToken: address,
    requestedFinalityConfig: uint32,
    _tokenArgs: cell?,
): (coins, uint32, uint32, uint16, bool) {
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

/// Calculates the fee based on the transferred amount, and the configured basis points.
/// @param lockOrBurnIn The original lock or burn request.
/// @param requestedFinalityConfig The requested finality encoding (see `FinalityCodec`).
/// A value of zero (FinalityCodec.WAIT_FOR_FINALITY_FLAG) applies default finality fees.
/// Returns the fee amount.
fun TokenPool<T>.getFeeAmount(
    self,
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): coins {
    // TODO: register as an available hook
    val details: TokenPool_TransferDetails<address, Cell<CrossChainAddress>, coins> = lazy transfer.details.load();
    val entry = self.data.tokenTransferFeeConfigs.get(details.remoteChainSelector);
    if (!entry.isFound) {
        return 0;
    }

    val feeConfig = entry.loadValue();
    if (!feeConfig.isEnabled) {
        return 0;
    }

    var transferFeeBps = feeConfig.finalityTransferFeeBps;
    if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        transferFeeBps = feeConfig.fastFinalityTransferFeeBps;
    }

    assert(transferFeeBps < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps); // Unexpected since it is validated in config update
    // SAFETY: Temporarily cast to int so compiler doesn't complain (all integers are `257`-bit signed `int`s in TVM's stack).
    // This product can't overflow because `details.amount` is 120 bits and `transferFeeBps` is 16 bits, so the product is at most 136 bits
    // const c = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF * 0xFFFF // MAX_UINT120 * MAX_UINT16 // Evaluated value: 0xFFFEFFFFFFFFFFFFFFFFFFFFFFFFFF0001 (136 bits)
    // SAFETY: Division result can be safely casted back to `coins` (`varuint120`) given
    // `transferFeeBps` is guaranteed to be less than `TOKEN_POOL_BPS_DIVIDER`, so the result will always be smaller than details.amount (`uint120`).
    return (details.amount as int * transferFeeBps as int) / TOKEN_POOL_BPS_DIVIDER; // TODO test case with max amount and max BPS to prove
}

/// Computes the pool's applicable fee config + the fee-adjusted (post-fee) amount for a
/// `TokenPool_GetCCVs` query, mirroring EVM's `getFee` + the outbound fee-subtraction in
/// `getRequiredCCVs`.
/// @return (feeConfig, amountPostFee, feesProvided). `feesProvided=false` when no enabled
///         config exists (callers fall back to FeeQuoter defaults). The inbound amount is
///         already post-fee, so only outbound subtracts the bps fee.
fun TokenPool<T>.getFeeParamsAndPostFeeAmount(
    self,
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: uint8,
): (TokenPool_TokenTransferFeeConfig, coins, bool) {
    val entry = self.data.tokenTransferFeeConfigs.get(remoteChainSelector);
    if (!entry.isFound || !entry.loadValue().isEnabled) {
        return (entry.isFound ? entry.loadValue() : TokenPool_TokenTransferFeeConfig { destGasOverhead: 0, destBytesOverhead: 0, finalityFeeUSDCents: 0, fastFinalityFeeUSDCents: 0, finalityTransferFeeBps: 0, fastFinalityTransferFeeBps: 0, isEnabled: false }, sourceDenominatedAmount, false);
    }

    val feeConfig = entry.loadValue();
    var amountPostFee = sourceDenominatedAmount;

    // The source fee amount is not classified as transferred value: subtract it for outbound.
    if (direction == TokenPool_MessageDirection.Outbound as uint8) {
        var transferFeeBps = feeConfig.finalityTransferFeeBps;
        if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
            transferFeeBps = feeConfig.fastFinalityTransferFeeBps;
        }
        assert(transferFeeBps < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        amountPostFee = mustCastToCoin(
            sourceDenominatedAmount as int - (sourceDenominatedAmount as int * transferFeeBps as int) / TOKEN_POOL_BPS_DIVIDER,
            TokenPool_Error.OverflowDetected
        );
    }

    return (feeConfig, amountPostFee, true);
}

/// Amount to pass to the CCV hooks for a transfer, mirroring EVM `getRequiredCCVs`:
/// - Outbound: the post-fee (source-denominated) amount.
/// - Inbound:  the amount converted to local decimals (via `extraData` `sourcePoolData`).
fun TokenPool<T>.getCCVAmount(
    self,
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: uint8,
    extraData: cell?,
): coins {
    if (direction == TokenPool_MessageDirection.Outbound as uint8) {
        val (_, amountPostFee, _) = self.getFeeParamsAndPostFeeAmount(remoteChainSelector, sourceDenominatedAmount, requestedFinalityConfig, direction);
        return amountPostFee;
    }

    val remoteDecimals = self.parseRemoteDecimals(extraData);
    return self.calculateLocalAmount(sourceDenominatedAmount as uint256, remoteDecimals);
}

/// Handles an on-chain `TokenPool_GetCCVs` query. Replies with `TokenPool_CCVs`, or with
/// `TokenPool_CCVsAndFees` when `fees` is set (the `AndFees` flow). When async
/// `advancedPoolHooks` are configured it forwards a `TokenPool_GetCCVs` to them for the CCV set
/// and assembles the reply on the `TokenPool_QueryCCVsReply` callback.
/// @param sender The msg.sender requesting the query (the reply destination).
/// @param fees Optional pre-computed fee params (`Cell<TokenPool_FeeContext>`); null for CCVs-only.
fun TokenPool<T>.onGetCCVs(
    mutate self,
    sender: address,
    msg: TokenPool_GetCCVs,
    fees: cell?,
): void {
    TokenPool_ensureRequestedFinalityAllowed(msg.requestedFinalityConfig, self.data.adminConfig.load().allowedFinalityConfig);
    assert(self.isSupportedToken(msg.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(msg.remoteChainSelector);

    val context = TokenPool_GetCCVsContext {
        replyTo: sender,
        fwdPayload: msg.forwardPayload,
        fees,
    };

    val hooks = self.data.adminConfig.load().advancedPoolHooks;
    if (hooks != null) {
        val ccvAmount = self.getCCVAmount(msg.remoteChainSelector, msg.amount, msg.requestedFinalityConfig, msg.direction, msg.extraData);
        val hooksMsg = createMessage({
            bounce: BounceMode.RichBounce,
            value: 0,
            dest: hooks!,
            body: TokenPool_GetCCVs {
                queryId: msg.queryId,
                localToken: msg.localToken,
                remoteChainSelector: msg.remoteChainSelector,
                amount: ccvAmount,
                requestedFinalityConfig: msg.requestedFinalityConfig,
                direction: msg.direction,
                extraData: msg.extraData,
                replyTo: contract.getAddress(), // hooks reply to the pool.
                forwardPayload: context.toCell(),
            },
        });
        hooksMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        return; // reply is assembled on the async callback.
    }

    // No hooks -> empty CCV set (callers fall back to lane defaults).
    self.sendCCVsReply(sender, msg.queryId, createEmptyCell() as SnakedCell<address>, context);
}

/// Handles an on-chain `TokenPool_GetCCVsAndFees` query: validates, computes the fee params and
/// forwards through the shared `onGetCCVs` flow with the fees set.
fun TokenPool<T>.onGetCCVsAndFees(
    mutate self,
    sender: address,
    msg: TokenPool_GetCCVsAndFees,
): void {
    val (feeConfig, amountPostFee, feesProvided) = self.getFeeParamsAndPostFeeAmount(
        msg.remoteChainSelector, msg.amount, msg.requestedFinalityConfig, msg.direction
    );
    val fees = TokenPool_FeeContext {
        feeConfig,
        amountPostFee,
        feesProvided,
    }.toCell();

    self.onGetCCVs(sender, TokenPool_GetCCVs {
        queryId: msg.queryId,
        localToken: msg.localToken,
        remoteChainSelector: msg.remoteChainSelector,
        amount: msg.amount,
        requestedFinalityConfig: msg.requestedFinalityConfig,
        direction: msg.direction,
        extraData: msg.extraData,
        replyTo: contract.getAddress(), // unused in the non-hooks path; set to self.
        forwardPayload: msg.forwardPayload,
    }, fees);
}

/// Assembles and sends the reply to the original requester, echoing the caller's `fwdPayload`.
/// Selects the reply variant from `context.fees` (null → `TokenPool_CCVs`, else `CCVsAndFees`).
fun TokenPool<T>.sendCCVsReply(
    self,
    replyTo: address,
    queryId: uint64,
    requiredCCVs: SnakedCell<address>,
    context: TokenPool_GetCCVsContext,
): void {
    var body: cell;
    if (context.fees == null) {
        body = TokenPool_CCVs {
            queryId: queryId,
            requiredCCVs: requiredCCVs,
            fwdPayload: context.fwdPayload,
        }.toCell();
    } else {
        body = TokenPool_CCVsAndFees {
            queryId: queryId,
            requiredCCVs: requiredCCVs,
            fees: context.fees! as Cell<TokenPool_FeeContext>,
            fwdPayload: context.fwdPayload,
        }.toCell();
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: replyTo,
        body: body,
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Sends `TokenPool_GetCCVsFailed` to the original requester, echoing their `fwdPayload`.
/// Finalizes a query that could not complete (e.g. the hooks contract bounced).
fun TokenPool<T>.sendCCVsFailed(
    self,
    replyTo: address,
    queryId: uint64,
    fwdPayload: cell?,
    errorCode: uint16,
): void {
    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: replyTo,
        body: TokenPool_GetCCVsFailed {
            queryId: queryId,
            errorCode: errorCode,
            fwdPayload: fwdPayload,
        },
    });
    failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handles the async `TokenPool_QueryCCVsReply` from `advancedPoolHooks`, assembling the final
/// reply to the original requester from the echoed context.
fun TokenPool<T>.onQueryCCVsReply(
    self,
    sender: address,
    msg: TokenPool_QueryCCVsReply,
): void {
    val hooks = self.data.adminConfig.load().advancedPoolHooks;
    assert(hooks != null && hooks! == sender, TokenPool_Error.Unauthorized);
    assert(msg.replyPayload != null, TokenPool_Error.MissingForwardPayload);

    val context = lazy (msg.replyPayload! as Cell<TokenPool_GetCCVsContext>).load();
    self.sendCCVsReply(context.replyTo, msg.queryId, msg.requiredCCVs, context);
}

/// Handles a bounced `TokenPool_GetCCVs` forwarded to the hooks contract, finalizing the
/// query by sending `TokenPool_GetCCVsFailed` to the original requester (via the echoed
/// context). Called from each concrete pool's `onBouncedMessage`.
fun TokenPool<T>.onGetCCVsBounced(
    self,
    msg: TokenPool_GetCCVs,
): void {
    if (msg.forwardPayload == null) {
        return; // no requester to notify
    }
    val context = lazy (msg.forwardPayload! as Cell<TokenPool_GetCCVsContext>).load();
    self.sendCCVsFailed(context.replyTo, msg.queryId, context.fwdPayload, TokenPool_Error.UnsupportedOperation as uint16);
}

/// Validates the lock or burn input for correctness on
/// - token to be locked or burned
/// - RMN curse status
/// - if the sender is a valid onRamp
/// - rate limiting for either default or FTF transfer messages.
/// - preflight checks hooks (if enabled)
/// 
/// @param sender The address of the original sender of the lock or burn request.
/// @param msg The full LockOrBurn message containing all request fields.
/// 
/// @dev This function should always be called before executing a lock or burn.
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
    val details: TokenPool_TransferDetails<address, Cell<CrossChainAddress>, coins> = lazy request.transfer.details.load();
    assert(self.isSupportedToken(details.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(details.remoteChainSelector);
    self.ensureNotCursed(details.remoteChainSelector);

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
    // Authenticate before invoking an overridable operation hook so a custom
    // pool cannot accidentally bypass the Router boundary.
    self.onlyRouter(sender);

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
    msgValue: coins,
): void {
    if (self.hooks != null && self.hooks.onLockOrBurnTransfer != null) {
        self.context = self.hooks.onLockOrBurnTransfer(self.context!, sender, msg);

        return;
    }

    // This is a trust boundary, rather than a recoverable transfer failure.
    // Never return tokens in response to a notification from an arbitrary
    // contract: only this pool's Jetton wallet can have credited custody.
    assert(self.data.jettonClient().isWallet(sender), TokenPool_Error.Unauthorized);

    try {
        // Authentication - we accept a deposit from either (1) the Router, or (2) a known Deployable namespace
        // with Router as owner (a known deployable addr key, per-user deposit account), where  multiple namespaces
        // can represent different types of OnRampAccount contracts. The TP needs to know (1) the Deployable
        // code (stable), (2) the Router address (stable), and (3) a set of namespaces (account types) it trusts.

        val forwardPayload = loadForwardPayloadAsSlice(msg.forwardPayload);
        val fwdp = TokenPool_LockOrBurnForwardPayload.fromSlice(forwardPayload!);

        // A valid pool wallet has already credited the tokens before it
        // delivers this notification. Once its payload is decoded, every
        // failure can return custody and notify the original requester.
        try {
            self.processLockOrBurnTransfer(sender, msg, fwdp);
        } catch (errorCode) {
            self.failLockOrBurnTransfer(sender, msg, fwdp, errorCode as uint16, msgValue);
        }
    } catch {
        // A malformed payload has no reliable reply target, but custody can
        // still be returned to a valid pool wallet.
        TokenPool<T>.returnTransfer(sender, msg);
    }
}

/// Process a decoded Jetton transfer notification after its sender has been authenticated.
/// @dev Deposit-source auth happens here, on the decoded forward payload: we accept custody that
///      was initiated by (1) the configured Router's own wallet, or (2) a Deployables-derived
///      per-user deposit account (e.g. OnRampAccount) whose namespace is allowed in dynamic config.
fun TokenPool<T>.processLockOrBurnTransfer(
    mutate self,
    sender: address,
    msg: TransferNotificationForRecipient,
    fwdp: TokenPool_LockOrBurnForwardPayload,
): void {
    val requestMsg = lazy fwdp.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();

    assert(details.amount == msg.jettonAmount, TokenPool_Error.AmountMismatch);
    assert(msg.transferInitiator != null, TokenPool_Error.MissingTransferInitiator);

    // Authenticate it before accepting custody.
    // `msg.transferInitiator` is the account whose wallet initiated the deposit: the Router in the
    // standard path, or the derived deposit account in the per-user path.
    self.assertAuthorizedDepositInitiator(msg.transferInitiator!, details.originalSender);

    self.onLockOrBurnTransferContinue(sender, msg, fwdp);
}

/// Verifies that a deposit was initiated by a trusted source before the pool accepts custody.
///
/// @param initiator The wallet owner that initiated the inbound Jetton transfer (`transferInitiator`).
/// @param originalSender The original CCIP sender on the source chain (the account's Deployables `id`).
///
/// @dev Accepts (1) the configured Router (standard LockOrBurn path), or (2) any per-user deposit
///      account derived via Deployables — Router as owner, an allowed namespace, id = originalSender.
/// 
///      Account-auth is opt-in: it is only enforced once the pool owner configures it (code, allowed namespaces).
fun TokenPool<T>.assertAuthorizedDepositInitiator(
    self,
    initiator: address,
    originalSender: address,
): void {
    val adminConfig = self.data.adminConfig.load();
    val dynamicConfig = adminConfig.dynamicConfig.load();

    // The Router itself is always a trusted source (standard Router -> pool withdraw path).
    if (initiator == dynamicConfig.router) {
        return;
    }

    // Look through all allowed namespace/account types for one that derives to `initiator`.
    var entry = dynamicConfig.allowedDepositNamespaces.findFirst();
    while (entry.isFound) {
        val namespace: Namespace = entry.getKey();
        val account = self.deriveDepositAccount(
            dynamicConfig.router,
            namespace,
            originalSender,
        ).calculateAddress();
        if (initiator == account) {
            return;
        }
        entry = dynamicConfig.allowedDepositNamespaces.iterateNext(entry);
    }

    throw TokenPool_Error.Unauthorized;
}

/// Derives the on-chain address of a per-user deposit account, deployed via the Deployables namespace
///
/// @param deployableCode The compiled Deployable contract code (address-namespace seed).
/// @param router The Router that owns the deployable deployment.
/// @param namespace The Deployables namespace identifying the account type (e.g. OnRampAccount).
/// @param user The on-chain user the account is keyed by (its Deployables `id`).
@inline
fun TokenPool<T>.deriveDepositAccount(
    self,
    router: address,
    namespace: Namespace,
    user: address,
): AutoDeployAddress {
    val code = self.data.adminConfig.load().deployableCode;
    assert(code != null, TokenPool_Error.Unauthorized);
    return AutoDeployAddress {
        stateInit: ContractState {
            code: code!,
            data: NamespacedDeployableData<address>({
                namespace,
                owner: router,
                id: user,
            }),
        },
    };
}

fun TokenPool<T>.onLockOrBurnTransferContinue(
    mutate self,
    sender: address,
    msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    if (self.hooks != null && self.hooks.onLockOrBurnTransferContinue != null) {
        self.context = self.hooks.onLockOrBurnTransferContinue(self.context!, sender, msg, fwdPayload);
        return;
    }

    return self.onLockOrBurnTransferFinalize(fwdPayload);
}

/// Returns a failure notification to the original requester, carrying the remaining value of the inbound transfer.
/// The pool's balance is reserved to ensure that the notification can be sent safely (without consuming the pool's balance).
fun TokenPool<T>.notifyLockOrBurnFailure(
    self,
    msgValue: coins,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
    errorCode: uint16,
): void {
    self.reserveLockOrBurnFailureValue(msgValue);

    val requestMsg = lazy forwardPayload.requestMsg.load();
    if (requestMsg.replyTo != null) {
        val failure = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnFailure {
                queryId: requestMsg.queryId,
                errorCode,
            },
        });
        failure.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
    }
}

/// Keep the pool's balance from before the inbound Jetton notification, then
/// allow recovery messages to carry only the notification's remaining value.
fun TokenPool<T>.reserveLockOrBurnFailureValue(self, msgValue: coins): void {
    // Storage accounting can leave a minimally funded pool with less balance
    // than the forwarded value. Saturate rather than throwing before recovery.
    val originalBalance = contract.getOriginalBalance();
    val balanceBeforeMessage = originalBalance > msgValue
        ? originalBalance - msgValue
        : 0 as coins;
    val toLeaveOnBalance = balanceBeforeMessage + contract.getStorageDuePayment();
    reserveToncoinsOnBalance(toLeaveOnBalance, RESERVE_MODE_AT_MOST);
}

/// Returns custody to the sender and notifies the original requester of a failed transfer.
fun TokenPool<T>.failLockOrBurnTransfer(
    self,
    sender: address,
    msg: TransferNotificationForRecipient,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
    errorCode: uint16,
    msgValue: coins,
): void {
    TokenPool<T>.returnTransfer(sender, msg);
    self.notifyLockOrBurnFailure(msgValue, forwardPayload, errorCode);
}

/// Returns jettons to the original sender after a failed lock (deposit) operation.
/// @dev Sends AskToTransfer to the pool's jetton wallet with original sender as recipient.
fun TokenPool<T>.returnTransferLocked(self, forwardPayload: TokenPool_LockOrBurnForwardPayload) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();

    val returnTransfer = createMessage({
        bounce: BounceMode.NoBounce,
        value: TokenPool_RETURN_TRANSFER_VALUE,
        dest: self.data.jettonClient().walletAddress(),
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: details.amount,
            transferRecipient: details.originalSender,
            sendExcessesTo: details.originalSender,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    returnTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
}

fun TokenPool<T>.returnTransfer(sender: address, msg: TransferNotificationForRecipient): void {
    // Only valid for a real inbound transfer (initiator + wallet set, amount > 0).
    if (msg.transferInitiator == null) {
        return; // nothing to do, no one to return to
    }

    // Send back tokens; direct transfers to the pool are not supported.
    val returnTransfer = createMessage({
        bounce: BounceMode.NoBounce,
        value: TokenPool_RETURN_TRANSFER_VALUE,
        dest: sender, // wallet address which sent us the transfer notification (our wallet)
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
    // Returning custody is best-effort. The remaining inbound value is carried
    // by the subsequent failure notification, after reserving pool balance.
    returnTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
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
    // Authenticate before invoking an overridable operation hook so a custom
    // pool cannot accidentally bypass the Router boundary.
    self.onlyRouter(sender);

    if (self.hooks != null && self.hooks.onReleaseOrMint != null) {
        self.context = self.hooks.onReleaseOrMint(self.context!, msg);

        return;
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
fun TokenPool<T>.calculateLocalAmount(self, remoteAmount: uint256, remoteDecimals: uint8): coins {
    return mustCastToCoin(fun(): uint256 {
        if (remoteDecimals == self.data.tokenDecimals) {
            return remoteAmount;
        }

        if (remoteDecimals > self.data.tokenDecimals) {
            val decimalsDiff = remoteDecimals - self.data.tokenDecimals;
            // This is a safety check to prevent overflow in the next calculation.
            // TODO Move to math as safePow() and mustPow()

            return remoteAmount / mustPow10(decimalsDiff, TokenPool_Error.OverflowDetected);
        }

        // This is a safety check to prevent overflow in the next calculation.
        // More than 77 would never fit in a uint256 and would cause an overflow.
        // We also check if the resulting amount would overflow.
        val decimalsDiff = self.data.tokenDecimals - remoteDecimals;
        val scale = mustPow10(decimalsDiff, TokenPool_Error.OverflowDetected);
        assert(scale == 0 || remoteAmount <= MAX_UINT256 / scale, TokenPool_Error.OverflowDetected);
    
        return remoteAmount * scale;
    }(), TokenPool_Error.OverflowDetected)
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
        sender == ownable.owner || (adminConfig.rmnProxy != null && sender == adminConfig.rmnProxy!),
        TokenPool_Error.Unauthorized
    );
}

/// Restricts CCIP token operations to the configured Router.
///
/// This check intentionally runs in the message dispatcher, before any pool
/// hook can handle LockOrBurn or ReleaseOrMint. The Router owns ramp
/// authentication and applies its own RMN policy; the pool independently
/// applies its local cursed-subject policy during request validation.
fun TokenPool<T>.onlyRouter(self, sender: address) {
    val router = self.data.adminConfig.load().dynamicConfig.load().router;
    assert(sender == router, TokenPool_Error.Unauthorized);
}

/// Authenticates asynchronous pool-hook continuations. Without this boundary,
/// an arbitrary sender could forge a success/failure continuation after the
/// Router-authenticated operation returned to the async flow.
fun TokenPool<T>.onlyAdvancedPoolHooks(self, sender: address) {
    val hooks = self.data.adminConfig.load().advancedPoolHooks;
    assert(hooks != null && sender == hooks!, TokenPool_Error.Unauthorized);
}

fun TokenPool<T>.ensureNotCursed(self, remoteChainSelector: uint64) {
    // The owner-selected local RMN policy is mandatory. Hooks may impose an
    // additional restriction, but cannot bypass this policy domain.
    assert(self.verifyNotCursed(remoteChainSelector as uint128), TokenPool_Error.CursedByRMN);

    if (self.hooks != null && self.hooks.ensureNotCursed != null) {
        return self.hooks.ensureNotCursed(self.context, remoteChainSelector);
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
fun TokenPool<T>.consumeOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.outbound.load();
    bucket.consume(amount, self.data.token());
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
fun TokenPool<T>.consumeInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket.consume(amount, self.data.token());
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
fun TokenPool<T>.releaseOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.outbound.load();
    bucket.refund(amount, self.data.token());
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
fun TokenPool<T>.releaseInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket.refund(amount, self.data.token());
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
fun TokenPool<T>.releaseFastFinalityOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.outbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.outbound.load();
        bucket.refund(amount, self.data.token());
        rateLimiters.outbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket.refund(amount, self.data.token());
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
fun TokenPool<T>.releaseFastFinalityInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.inbound.load();
    if (!fastBucket.isEnabled) {
        var rateLimiters = config.rateLimiters.load();
        var bucket = rateLimiters.inbound.load();
        bucket.refund(amount, self.data.token());
        rateLimiters.inbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket.refund(amount, self.data.token());
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
/// @dev If FF rate limiter is not enabled for the chain, it will fallback to the default rate limiter.
/// @param remoteChainSelector The remote chain selector.
/// @param amount The amount of tokens consumed.
fun TokenPool<T>.consumeFastFinalityOutboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.outbound.load();
    if (!fastBucket.isEnabled) {
        self.consumeOutboundRateLimit(remoteChainSelector, amount);
    } else {
        fastBucket.consume(amount, self.data.token());
        fastRateLimiters.outbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
        self.data.remoteChainConfigs.set(remoteChainSelector, config);
    }

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
fun TokenPool<T>.consumeFastFinalityInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.inbound.load();
    if (!fastBucket.isEnabled) {
        self.consumeInboundRateLimit(remoteChainSelector, amount);
    } else {
        fastBucket.consume(amount, self.data.token());
        fastRateLimiters.inbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
        self.data.remoteChainConfigs.set(remoteChainSelector, config);
    }

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
            outbound: rateLimiters.outbound.load().currentTokenBucketState().toCell(),
            inbound: rateLimiters.inbound.load().currentTokenBucketState().toCell(),
        };
    }

    val rateLimiters = config.rateLimiters.load();
    return TokenPool_RateLimiterPair {
        outbound: rateLimiters.outbound.load().currentTokenBucketState().toCell(),
        inbound: rateLimiters.inbound.load().currentTokenBucketState().toCell(),
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

/// Withdraws accrued fee jettons.
/// @dev Only callable by the owner or the configured fee admin (mirrors EVM `CallerIsNotOwnerOrFeeAdmin`),
///      enforced here before invoking the shared `JettonWithdrawable` handler (which is deliberately
///      auth-agnostic and expects the caller to gate access).
/// @param msg The withdrawal request: concrete wallet + value + `AskToTransfer` set.
/// Default fee-withdrawal entry point (dispatched from `onInternalMessage` for `JettonWithdrawable_Withdraw`).
/// Consults the `onWithdrawFeeTokens` hook when one is wired otherwise relays the caller's
/// requested transfers with no ledger bound (cap = sum of the requested amounts, so every
/// per-transfer ask passes — the trust boundary is `onlyOwnerOrFeeAdmin`).
fun TokenPool<T>.onWithdrawFeeTokensDispatch(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: JettonWithdrawable_Withdraw,
) {
    if (self.hooks != null && self.hooks.onWithdrawFeeTokens != null) {
        self.context = self.hooks.onWithdrawFeeTokens(self.context!, sender, msgValue, msg);
        return;
    }

    // No cap by default, can be specialized by the hook (e.g. pools with an accrued-fee ledger,
    // e.g. lock/release (no lockbox), bound the withdrawal).
    val maxAmount = INT_MAX as coins;
    self.withdrawFeeTokens(sender, msgValue, msg, maxAmount);
}

/// Withdraws accrued fee jettons by relaying the provided transfers to the given wallets.
/// @dev The caller (owner or fee admin) gates access here, since the shared handler is auth-agnostic.
///      The withdrawal is restricted to exactly one transfer against the pool's own jetton wallet, so
///      a caller cannot inject asks for arbitrary other-token wallets.
/// @param sender The caller; must be the owner or fee admin.
/// @param msgValue The TON value carried by the inbound withdrawal message; must cover the sum of
///     the relayed transfer values + reserve (validated in `JettonWithdrawable.onWithdraw`).
/// @param msg The withdrawal request (wallet + transfer pairs).
/// @param maxAmount The upper bound enforced per transfer. Pools with an accrued-fee ledger pass
///     their ledger (e.g. lock/release); others pass the sum of the requested amounts.
fun TokenPool<T>.withdrawFeeTokens(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: JettonWithdrawable_Withdraw,
    maxAmount: coins,
): coins {
    // The caller (owner or fee admin) gates access here, since the shared handler is auth-agnostic.
    assert(self.onlyOwnerOrFeeAdmin(sender), TokenPool_Error.CallerIsNotOwnerOrFeeAdmin);

    // TODO: should we be less strict and allow multiple token/wallet transfers?
    // Single-token pools relay exactly one fee withdrawal, and only against the pool's own wallet.
    assert(msg.transfers.size() == 1, JettonWithdrawable_Error.InvalidWithdrawWallet);
    val transfer = msg.transfers.get(0);
    assert(transfer.wallet == self.data.jettonClient().walletAddress(), JettonWithdrawable_Error.InvalidWithdrawWallet);

    // No recipient allowlist: access is gated by onlyOwnerOrFeeAdmin above, and the handler still
    // forbids withdrawing to the zero/none address (which would burn the jettons).
    return JettonWithdrawable.onWithdraw(
        msgValue,
        sender,
        msg,
        maxAmount,
        null,
    );
}

/// Whether the caller is the owner or the fee admin
fun TokenPool<T>.onlyOwnerOrFeeAdmin(self, sender: address): bool {
    val adminConfig = self.data.adminConfig.load();
    val dynamicConfig = adminConfig.dynamicConfig.load();
    val ownable = adminConfig.ownable.load();
    val senderIsFeeAdmin = fun () {
        return dynamicConfig.feeAdmin != null
            && sender == dynamicConfig.feeAdmin;
    };
    return sender == ownable.owner || senderIsFeeAdmin();
}

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
