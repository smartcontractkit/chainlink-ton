// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../../../../../gen/Deployable.code"

import "../../../../lib/math"
import "../../../../lib/utils"
import "../../../../lib/budget/gas"
import "../../../../lib/budget/min_value"
import "../../../../lib/jetton/messages"
import "../../../../lib/jetton/jetton_client"
import "../../../../lib/jetton/forward_payload_wrap"
import "../../../../lib/access/ownable_2step"
import "../../../../lib/deployable/namespace"
import "../../../../lib/funding/jetton_withdrawable"

import "../../../common/types"
import "../../../rmn_remote/lib"
import "../../../router/types"

import "../rate_limiter"

import "types"
import "budget"
import "errors"
import "messages"
import "events"

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
    dynamicConfig: Cell<TokenPool_DynamicConfig>;

    /// Allowed Deployables namespaces for source-chain deposit accounts. Refreshed from the
    /// Router on every `TokenPool_LockOrBurn` (see `updateDepositNamespaces`); the namespace
    /// check itself lives in `assertAuthorizedDepositInitiator`.
    allowedDepositNamespaces: map<uint32, ()> = [];
    
    /// The pool's Jetton identity (master + wallet code). Single source of truth used to
    /// derive and authenticate the pool's own wallet.
    jettonClient: JettonClient;
    /// Allowed finality config for fast finality transfers (see `FinalityCodec`).
    /// FinalityCodec.WAIT_FOR_FINALITY_FLAG means wait for finality.
    allowedFinalityConfig: uint32 = TOKEN_POOL_DEFAULT_FINALITY;
    /// Optional advanced pool hooks contract for additional features like allowlists and CCV management.
    advancedPoolHooks: address? = null;
}

struct TokenPool_Data {
    adminConfig: Cell<TokenPool_AdminConfig>;
    localPolicy: Cell<TokenPool_LocalPolicy>;
    tokenDecimals: uint8;
    remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig> = [];
    tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig> = [];
    /// Per-instance budget; it can only raise the pool-type defaults (zero keeps a default).
    /// Set at deploy/init or via `TokenPool_SetBudget`. See `TokenPool<T>.budget`.
    budget: TokenPool_Budget = {};
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
/// - **Guards**: curse checks, invoked from the base admission path.
/// - **Operation hooks**: entry + validation + (pre/post)flight for the LockOrBurn and
///   ReleaseOrMint flows. Hooks returning a `TokenPool_*Prepared` may also signal `wait` to defer
///   execution to the on-chain (async) `advancedPoolHooks` contract.
/// - **Continuation hooks**: run after Jetton custody is settled, letting the pool track binding
///   side effects (e.g. lock/release accrues fees only on confirmed deposit).
///
/// Setting an operation hook replaces the base flow for that phase, so the override owns every
/// check the base path would have performed (e.g., `validateLockOrBurn` / `validateReleaseOrMint`).
///
/// The fee-withdrawal hook `onWithdrawFeeTokens` is a fourth, standalone extension point.
struct TokenPool_Hooks<T> {
    /// RMN curse guard for a remote lane.
    /// @param remoteChainSelector The remote lane to check for a curse.
    /// @dev Base behavior: reverts if the lane's cursed subjects mark it cursed by RMN.
    ensureNotCursed: ((T?, uint64) -> void)? = null

    // ----------------------------------------------------------------------
    // ReleaseOrMint flow (inbound)
    // ----------------------------------------------------------------------

    /// Runs before validation when an inbound `ReleaseOrMint` arrives.
    /// @param msg         The full inbound request.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: continues to `validateReleaseOrMint`.
    onReleaseOrMint: ((T, TokenPool_ReleaseOrMint) -> T)? = null;

    /// Validates an inbound request and prepares the release/mint.
    /// @param sender      The msg.sender (must be the OffRamp).
    /// @param msg         The full inbound request.
    /// @return (newContext, wait, prepared); `wait` = `true` defers to the async postflight hook.
    /// @dev Base behavior: token/chain/curse/access/pool checks + inbound rate-limit consumption
    ///      and `postflightCheck`. Regarding rate limits, an override REPLACES the base checks,
    ///      so it must consume the inbound rate limit itself.
    validateReleaseOrMint: ((T, address, TokenPool_ReleaseOrMint) -> (T, bool, TokenPool_ReleaseOrMintPrepared))? = null;

    /// Async postflight gate: called once validation has consumed the rate limit.
    /// @param msg        The full inbound request.
    /// @param fwdPayload Carries `requestMsg` + `prepared` for later resumption.
    /// @return `true` to wait for a `TokenPool_PostflightCheckFinished/Failed` callback from the
    ///         configured `advancedPoolHooks`; `false` to continue immediately.
    /// @dev Only checked when the pool has async hooks configured; a custom hook here and async
    ///      hooks are mutually exclusive (inline wins).
    postflightCheck: ((T?, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintForwardPayload) -> bool)? = null

    /// Continuation after custody is confirmed.
    /// @param sender   The msg.sender of the original request.
    /// @param msgValue The value of the inbound message.
    /// @param msg      The full inbound request.
    /// @param prepared The validated release/mint data.
    /// @return The (possibly mutated) context, or `null`.
    onReleaseOrMintContinue: ((T?, address, coins, TokenPool_ReleaseOrMint, TokenPool_ReleaseOrMintPrepared) -> T?);

    // ----------------------------------------------------------------------
    // LockOrBurn flow (outbound)
    // ----------------------------------------------------------------------

    /// Runs before validation when an outbound `LockOrBurn` arrives.
    /// @param sender      The msg.sender requesting the lock/burn.
    /// @param msg         The full outbound request.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: continues to `validateLockOrBurn` (sender = the transfer initiator).
    onLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> T)? = null;

    /// Validates an outbound request and prepares the lock/burn.
    /// @param sender      The msg.sender requesting the lock/burn.
    /// @param msg         The full outbound request.
    /// @return (newContext, wait, prepared); `wait` = `true` defers to the async preflight hook.
    /// @dev Base behavior: token/chain/curse/access checks + outbound rate-limit consumption and
    ///      `preflightCheck`. Regarding rate limits, an override REPLACES the base checks, so it
    ///      must consume the outbound rate limit itself.
    validateLockOrBurn: ((T, address, TokenPool_LockOrBurn) -> (T, bool, TokenPool_LockOrBurnPrepared))? = null;

    /// Async preflight gate: called once validation has consumed the rate limit.
    /// @param msg        The full outbound request.
    /// @param fwdPayload Carries `requestMsg` + `prepared` for later resumption.
    /// @return `true` to wait for a `TokenPool_PreflightCheckFinished/Failed` callback from the
    ///         configured `advancedPoolHooks`; `false` to continue immediately.
    /// @dev Only checked when the pool has async hooks configured; a custom hook here and async
    ///      hooks are mutually exclusive (inline wins).
    preflightCheck: ((T?, TokenPool_LockOrBurn, TokenPool_LockOrBurnForwardPayload) -> bool)? = null;

    /// Entry on the Jetton transfer notification (after tokens reach the pool's wallet).
    /// @param sender  The pool's Jetton wallet that delivered the notification.
    /// @param msg     The decoded inbound `TransferNotificationForRecipient`.
    /// @return The (possibly mutated) context flowing to subsequent hooks.
    /// @dev Base behavior: authenticates the wallet, decodes the forward payload, authenticates
    ///      the deposit initiator, then continues to `onLockOrBurnTransferContinue`.
    onLockOrBurnTransfer: ((T, address, TransferNotificationForRecipient) -> T)? = null;

    /// Continuation once deposit custody is authenticated and confirmed.
    /// @param sender    The pool's Jetton wallet that delivered the notification.
    /// @param msgValue  The incoming notification value after the base safety check.
    /// @param msg       The decoded inbound transfer notification.
    /// @param fwdPayload The original request + prepared data.
    /// @return The (possibly mutated) context.
    onLockOrBurnTransferContinue: ((T, address, coins, TransferNotificationForRecipient, TokenPool_LockOrBurnForwardPayload) -> T);

    // ----------------------------------------------------------------------
    // FeeWithdrawal flow (JettonWithdrawable)
    // ----------------------------------------------------------------------

    /// Withdraws accrued fee jettons from the pool's wallet.
    /// @param sender   The withdrawal caller (owner or fee admin).
    /// @param msgValue The TON value on the inbound withdrawal message (must cover all asks + reserve).
    /// @param msg      The withdrawal request (wallet + `AskToTransfer` pairs).
    /// @return The (possibly mutated) context.
    /// @dev Base behavior: unbounded relay (cap = sum of requested amounts) by `onlyOwnerOrFeeAdmin`.
    onWithdrawFeeTokens: ((T?, address, coins, JettonWithdrawable_Withdraw) -> T?)? = null;

    // ----------------------------------------------------------------------
    // Configuration
    // ----------------------------------------------------------------------

    /// Pool-type default budget: the floor the per-instance `budget` can only raise.
    /// @dev Base behavior: the CCIP defaults (`admission`, `safety` costs). Pool types
    ///      return their measured defaults; a custom pool may compute them.
    defaultBudget: ((T?) -> TokenPool_Budget)? = null;

    /// `transferInitiator` of the pool's release/mint jetton deliveries, reported to the registry.
    /// @dev Base behavior: `null`, i.e. the pool delivers by minting.
    transferInitiator: ((T?) -> address?)? = null;
}

@inline
fun TokenPool<T>.load(context: T? = null, hooks: TokenPool_Hooks<T>? = null): TokenPool<T> {
    val data = TokenPool_Data.fromContractData();
    return TokenPool<T> { data, context, hooks };
}

fun TokenPool<T>.store(self) {
    self.data.storeAsContractData();
}

/// Effective budget: the per-instance `budget` raised to at least the pool-type default.
fun TokenPool<T>.budget(self): TokenPool_Budget {
    val floor = self.hooks != null && self.hooks.defaultBudget != null
        ? self.hooks.defaultBudget(self.context)
        : TokenPool_Budget {
            lockOrBurn: {
                admission: TokenPool_Costs.admission(),
                safety: TokenPool_Costs.safety(),
            },
            releaseOrMint: {
                admission: TokenPool_Costs.admission(),
                safety: TokenPool_Costs.safety(),
            },
        };
    val effective = self.data.budget.over(floor);
    return {
        lockOrBurn: {
            admission: max(
                effective.lockOrBurn.admission,
                effective.lockOrBurn.safety * LB_CUSTODY_MOVES_BEFORE_WITHDRAW
            ),
            safety: effective.lockOrBurn.safety,
        },
        releaseOrMint: effective.releaseOrMint,
    };
}

/// TON the custody transfer must carry to the pool: `safety` for each remaining custody phase
/// plus the caller-provided success/failure continuation.
fun TokenPool<T>.custodyForward(self, custodyMoves: int, finalizationValue: coins): coins {
    return self.budget().lockOrBurn.safety * custodyMoves + finalizationValue;
}

/// TON the release/mint delivery must forward: the pool's finalization safety plus the caller's
/// delivery continuation.
fun TokenPool<T>.releaseOrMintForward(self, finalizationValue: coins): coins {
    return self.budget().releaseOrMint.safety + finalizationValue;
}

/// Flat floor for admin, config and query handlers: a visible error instead of an out-of-gas
/// failure. These handlers are atomic, so this is not part of the flow budget.
fun TokenPool<T>.requireMinValue(self, msgValue: coins) {
    assertMinValue(msgValue, TokenPool_Costs.admin(), TokenPool_Error.InsufficientMessageValue);
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
    val adminConfig = lazy self.data.adminConfig.load();
    return adminConfig.advancedPoolHooks;
}

@inline
fun TokenPool<T>.verifyNotCursed(self, subject: uint128): bool {
    val localPolicy = lazy self.data.localPolicy.load();
    return !localPolicy.cursePolicy.cursedSubjects.isCursed(subject);
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

/// Sets the per-instance budget. Values only raise the pool-type defaults; the effective
/// admission always covers the custody forward. Owner-only.
/// @dev Changing the admission budget requires a registry refresh (`RefreshPoolConfig`) so CCIP
///      funds the new value.
fun TokenPool<T>.setBudget(mutate self, sender: address, msgValue: coins, queryId: uint64, budget: TokenPool_Budget) {
    self.requireMinValue(msgValue);
    self.data.adminConfig.load().ownable.load().requireOwner(sender);

    self.data.budget = budget;

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_BudgetSet { queryId, budget: self.budget() },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Answers the registry probe with the configuration it caches. No value gate: the answer
/// carries the probe's own value back and changes no state.
fun TokenPool<T>.onGetConfig(self, sender: address, queryId: uint64) {
    val transferInitiator = self.hooks != null && self.hooks.transferInitiator != null
        ? self.hooks.transferInitiator(self.context)
        : null;
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: TokenPool_Config { queryId, transferInitiator, admission: self.budget().admission() },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// @param feeAdmin An additional address that can withdraw fees from this contract.
/// @dev FeeTokenHandler will revert if feeAdmin is zero when withdrawing fees.
/// @dev If only the owner can withdraw fees, set feeAdmin to address(0).
fun TokenPool<T>.setDynamicConfig(
    mutate self,
    sender: address,
    msgValue: coins,
    queryId: uint64,
    router: address,
    rateLimitAdmin: address?,
    feeAdmin: address?,
) {
    // minval:check-bounce gate=S TokenPool_SetDynamicConfig
    // owner-only dynamic config
    self.requireMinValue(msgValue);

    var adminConfig = self.data.adminConfig.load();
    adminConfig.ownable.load().requireOwner(sender);

    // The router must be a real address; zero would break routeMessage forwarding.
    assert(!isZeroAddress(router), TokenPool_Error.ZeroAddressInvalid);
    // feeAdmin: `null` means owner-only; the zero address is never a valid fee admin.
    assert(feeAdmin == null || !isZeroAddress(feeAdmin!), TokenPool_Error.ZeroAddressInvalid);

    var dynamicConfig = adminConfig.dynamicConfig.load();
    dynamicConfig.router = router;
    dynamicConfig.rateLimitAdmin = rateLimitAdmin;
    dynamicConfig.feeAdmin = feeAdmin;
    adminConfig.dynamicConfig = dynamicConfig.toCell();
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
fun TokenPool<T>.setAllowedFinalityConfig(mutate self, sender: address, msgValue: coins, queryId: uint64, allowedFinalityConfig: uint32) {
    // minval:check-bounce gate=S TokenPool_SetAllowedFinalityConfig
    // owner-only finality config
    self.requireMinValue(msgValue);

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
    msgValue: coins,
    queryId: uint64,
    advancedPoolHooks: address?,
) {
    // minval:check-bounce gate=S TokenPool_SetAdvancedPoolHooks
    // owner-only hooks config
    self.requireMinValue(msgValue);

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
    msgValue: coins,
    queryId: uint64,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    // minval:check-bounce gate=S TokenPool_AddRemotePool
    // owner-only remote pool config
    self.requireMinValue(msgValue);

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
    msgValue: coins,
    queryId: uint64,
    remoteChainSelector: uint64,
    remotePoolAddress: Cell<CrossChainAddress>,
) {
    // minval:check-bounce gate=S TokenPool_RemoveRemotePool
    // owner-only remote pool config
    self.requireMinValue(msgValue);

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
    msgValue: coins,
    queryId: uint64,
    remoteChainSelectorsToRemove: SnakedCell<uint64>,
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>,
) {
    // minval:check-bounce gate=S TokenPool_ApplyChainUpdates
    // owner-only chain/rate-limit config
    // TODO: A/dynamic - loops removals/additions/remote pools; a static S does not bound large inputs
    self.requireMinValue(msgValue);

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
        assert(!TokenPool<T>.isEmptyCrossChainAddress(remoteTokenAddress), TokenPool_Error.ZeroAddressInvalid);

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
            outboundRateLimiterConfig: rateLimitConfigs.outbound,
            inboundRateLimiterConfig: rateLimitConfigs.inbound,
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

/// Curses `subjects` in the pool-local `CursePolicy`. Sender must hold
/// `CURSE_ROLE` or be the policy admin, which is not the pool owner.
fun TokenPool<T>.curse(mutate self, sender: address, msgValue: coins, subjects: SnakedCell<uint128>) {
    // minval:best-effort gate=none TokenPool_Curse
    // RMN admin operation

    var localPolicy = self.data.localPolicy.load();
    localPolicy.cursePolicy.requireCurseRole(sender);
    localPolicy.cursePolicy.curseAll(subjects);
    self.data.localPolicy = localPolicy.toCell();
}

/// Uncurses `subjects` in the pool-local `CursePolicy`. Sender must hold
/// `UNCURSE_ROLE` or be the policy admin.
fun TokenPool<T>.uncurse(mutate self, sender: address, msgValue: coins, subjects: SnakedCell<uint128>) {
    // minval:best-effort gate=none TokenPool_Uncurse
    // RMN admin operation

    var localPolicy = self.data.localPolicy.load();
    localPolicy.cursePolicy.requireUncurseRole(sender);
    localPolicy.cursePolicy.uncurseAll(subjects);
    self.data.localPolicy = localPolicy.toCell();
}

fun TokenPool<T>.onCursePolicyAccessControlMessage(mutate self, sender: address, msgValue: coins, body: slice) {
    // minval:check-bounce gate=S TokenPool_RMNAccessControlMessage
    // RMN access-control admin
    self.requireMinValue(msgValue);

    var policy = self.data.localPolicy.load();
    policy.cursePolicy.onAccessControlMessage(sender, body);
    self.data.localPolicy = policy.toCell();
}

/// Two-step transfer of the pool's curse administrator. Wrapped in its own
/// message because the pool's `Ownable2Step` already claims the bare opcodes.
fun TokenPool<T>.onCursePolicyOwnableMessage(mutate self, sender: address, msgValue: coins, body: slice) {
    // minval:check-bounce gate=S TokenPool_RMNOwnableMessage
    // RMN ownership admin
    self.requireMinValue(msgValue);

    var policy = self.data.localPolicy.load();
    assert(policy.cursePolicy.onOwnableMessage(sender, body)) throw 0xFFFF;
    self.data.localPolicy = policy.toCell();
}

fun TokenPool<T>.onInternalMessage(mutate self, msgSender: address, msgValue: coins, msgBody: slice): bool {
    val msg = lazy TokenPool_InMessage.fromSlice(msgBody);

    match (msg) {
        TokenPool_LockOrBurn => {
            self.onLockOrBurn(msgSender, msgValue, msg);
        }
        TokenPool_PreflightCheckFinished => {
            self.onPreflightCheckFinished(msgSender, msgValue, msg);
        }
        TokenPool_PreflightCheckFailed => {
            self.onPreflightCheckFailed(msgSender, msgValue, msg);
        }
        TokenPool_LockOrBurnWithdrawFailed => {
            self.onLockOrBurnWithdrawFailed(msgSender, msg, msgValue);
        }
        // Once we withdraw via Executor -> OnRamp -> JettonWallet, we will receive a TransferNotificationForRecipient callback,
        // which is only allowed to be called by a valid OnRamp address, otherwise we try a best effort return.
        //
        // If recovery is underfunded, received Jettons remain in the pool wallet.
        TransferNotificationForRecipient => {
            self.onLockOrBurnTransfer(msgSender, msgValue, msg);
        }
        TokenPool_ReleaseOrMint => {
            self.onReleaseOrMint(msgSender, msgValue, msg);
        }
        TokenPool_ReleaseOrMintDelivered => {
            self.onReleaseOrMintDelivered(msgSender, msgValue, msg);
        }
        TokenPool_PostflightCheckFinished => {
            self.onPostflightCheckFinished(msgSender, msgValue, msg);
        }
        TokenPool_PostflightCheckFailed => {
            self.onPostflightCheckFailed(msgSender, msgValue, msg);
        }
        TokenPool_GetCCVs => {
            self.onGetCCVs(msgSender, msgValue, msg, null);
        }
        TokenPool_GetCCVsAndFees => {
            self.onGetCCVsAndFees(msgSender, msgValue, msg);
        }
        TokenPool_QueryCCVsReply => {
            self.onQueryCCVsReply(msgSender, msgValue, msg);
        }
         TokenPool_ApplyChainUpdates => {
            self.applyChainUpdates(msgSender, msgValue, msg.queryId, msg.remoteChainSelectorsToRemove, msg.chainsToAdd);
        }
        TokenPool_AddRemotePool => {
            self.addRemotePool(msgSender, msgValue, msg.queryId, msg.remoteChainSelector, msg.remotePoolAddress);
        }
        TokenPool_RemoveRemotePool => {
            self.removeRemotePool(msgSender, msgValue, msg.queryId, msg.remoteChainSelector, msg.remotePoolAddress);
        }
        TokenPool_SetDynamicConfig => {
            self.setDynamicConfig(msgSender, msgValue, msg.queryId, msg.router, msg.rateLimitAdmin, msg.feeAdmin);
        }
        TokenPool_SetAllowedFinalityConfig => {
            self.setAllowedFinalityConfig(msgSender, msgValue, msg.queryId, msg.allowedFinalityConfig);
        }
        TokenPool_SetAdvancedPoolHooks => {
            self.setAdvancedPoolHooks(msgSender, msgValue, msg.queryId, msg.advancedPoolHooks);
        }
        TokenPool_SetRateLimitConfig => {
            self.setRateLimitConfig(msgSender, msgValue, msg.queryId, msg.updates);
        }
        TokenPool_ApplyTokenTransferFeeConfigUpdates => {
            self.applyTokenTransferFeeConfigUpdates(msgSender, msgValue, msg.queryId, msg.updates, msg.disableChainSelectors);
        }
        TokenPool_Curse => {
            self.curse(msgSender, msgValue, msg.subjects);
        }
        TokenPool_Uncurse => {
            self.uncurse(msgSender, msgValue, msg.subjects);
        }
        TokenPool_RMNAccessControlMessage => {
            self.onCursePolicyAccessControlMessage(msgSender, msgValue, msg.content.beginParse());
        }
        TokenPool_RMNOwnableMessage => {
            self.onCursePolicyOwnableMessage(msgSender, msgValue, msg.content);
        }
        JettonWithdrawable_Withdraw => {
            self.onWithdrawFeeTokensDispatch(msgSender, msgValue, msg);
        }
        TokenPool_SetBudget => {
            self.setBudget(msgSender, msgValue, msg.queryId, msg.budget);
        }
        TokenPool_GetConfig => {
            self.onGetConfig(msgSender, msg.queryId);
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

/// Shared bounce handler for the messages the base TokenPool library (see `TokenPool_BouncedMessage`)
fun TokenPool<T>.onBouncedMessage(mutate self, bouncedSender: address, msgValue: coins, bouncedBody: slice): bool {
    // A failed best-effort return: accept its value in the pool. The truncated body is
    // intentionally not parsed; jettons remain in the pool wallet.
    if (isShortAskToTransferBounce(bouncedBody)) {
        return true;
    }

    val rich = lazy RichBounceBody.fromSlice(bouncedBody);
    val msg = lazy TokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        TokenPool_LockOrBurnWithdraw => {
            // Fail by notifying the target (replyTo); reimburse any consumed rate limit
            self.recoverLockOrBurnFailure(msg.forwardPayload, rich.exitCode, msgValue);
            return true;
        }
        TokenPool_GetCCVs => {
            // Fail by notifying the target (replyTo)
            self.onGetCCVsBounced(msg, rich.exitCode);
            return true;
        }
        TokenPool_PreflightCheck => {
            // Fail by notifying the target (replyTo); reimburse any consumed rate limit
            assert(msg.replyPayload != null, TokenPool_Error.MissingForwardPayload);
            val fwdp = (msg.replyPayload! as Cell<TokenPool_LockOrBurnForwardPayload>).load();
            self.recoverLockOrBurnFailure(fwdp, rich.exitCode, msgValue);
            return true;
        }
        TokenPool_PostflightCheck => {
            // Fail by notifying the target (replyTo); reimburse any consumed rate limit
            assert(msg.replyPayload != null, TokenPool_Error.MissingForwardPayload);
            val fwdp = (msg.replyPayload! as Cell<TokenPool_ReleaseOrMintForwardPayload>).load();
            self.recoverReleaseOrMintFailure(fwdp, rich.exitCode, msgValue);
            return true;
        }
        else => {
            return false; // pool-specific message — let the concrete pool handle it
        }
    }
}

// ================================================================
// │              Async preflight/postflight callbacks              │
// ================================================================

/// Resumes the LockOrBurn flow after the advanced hooks confirmed the preflight check
fun TokenPool<T>.onPreflightCheckFinished(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_PreflightCheckFinished,
): void {
    self.onlyAdvancedPoolHooks(sender);

    val fwdp = msg.forwardPayload.load();
    var requestMsg = lazy fwdp.requestMsg.load();
    var prepared = lazy fwdp.prepared.load();

    try {
        // minval:check-fail gate=S TokenPool_PreflightCheckFinished
        // The hook must return enough for the pre-withdraw gate (`3S + F`): one `S` funds this
        // withdraw relay, `2S + F` is forwarded to the deposit account.
        val custodyMoves = LB_CUSTODY_MOVES_BEFORE_WITHDRAW;
        val minValue = self.custodyForward(custodyMoves, requestMsg.finalizationValue);
        assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);
    } catch (errorCode) {
        self.recoverLockOrBurnFailure(fwdp, errorCode, msgValue);
        return;
    }

    self.onLockOrBurnWithdraw(fwdp.originalSender, msgValue, requestMsg, prepared);
}

fun TokenPool<T>.onPreflightCheckFailed(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_PreflightCheckFailed,
): void {
    // minval:recovery gate=none TokenPool_PreflightCheckFailed
    // async preflight failure; unwinds the flow

    self.onlyAdvancedPoolHooks(sender);
    val fwdp = msg.forwardPayload.load();
    self.recoverLockOrBurnFailure(fwdp, TokenPool_Error.PreflightCheckFailed as int32, msgValue);
}

/// Handles a withdrawal rejection from the OnRamp (relayed by the Router): the lock/burn
/// output failed the OnRamp's validation, so the transfer can never be emitted. Refunds the
/// outbound rate limit consumed at admission and fails the send so the executor can settle.
/// @dev Only the configured Router may relay this failure.
fun TokenPool<T>.onLockOrBurnWithdrawFailed(
    mutate self,
    sender: address,
    msg: TokenPool_LockOrBurnWithdrawFailed,
    msgValue: coins,
): void {
    // minval:recovery gate=none TokenPool_LockOrBurnWithdrawFailed
    // authenticated failure callback; recover locally, no gate
    self.onlyRouter(sender);
    // TBD do we need a hook here?
    val fwdp = lazy msg.forwardPayload.load();

    // Custody never left the pool's wallet: reinstate the rate limit consumed at admission and
    // fail the send so the executor can settle. `recoverLockOrBurnFailure` also refunds the limit,
    // so it must not be refunded again here.
    self.recoverLockOrBurnFailure(fwdp, msg.errorCode, msgValue);
}

/// Resumes the ReleaseOrMint flow after the advanced hooks confirmed the postflight check
fun TokenPool<T>.onPostflightCheckFinished(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_PostflightCheckFinished,
): void {
    self.onlyAdvancedPoolHooks(sender);

    val fwdp = msg.forwardPayload.load();
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    try {
        // minval:check-fail gate=S TokenPool_PostflightCheckFinished
        // The reply carries the rest of the flow; it must still cover the delivery and finalization.
        val minValue = self.releaseOrMintForward(requestMsg.finalizationValue());
        assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);

        self.onReleaseOrMintContinue(fwdp.originalSender, msgValue, requestMsg, prepared);
    } catch (errorCode) {
        self.recoverReleaseOrMintFailure(fwdp, errorCode, msgValue);
    }
}

fun TokenPool<T>.onPostflightCheckFailed(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_PostflightCheckFailed,
): void {
    // minval:recovery gate=none TokenPool_PostflightCheckFailed
    // async postflight failure; unwinds the flow

    self.onlyAdvancedPoolHooks(sender);
    val fwdp = msg.forwardPayload.load();
    self.recoverReleaseOrMintFailure(fwdp, TokenPool_Error.PostflightCheckFailed as int32, msgValue);
}

// ================================================================
// │      Common notification & rate-limit refund helpers           │
// ================================================================

/// Refunds the outbound (or fast-finality outbound) rate limit capacity that was consumed
/// before a LockOrBurn operation when it later fails.
/// @param forwardPayload The forward payload carrying the original request and prepared data.
/// @dev Picks the correct rate limiter bucket based on the requested finality config.
fun TokenPool<T>.refundLockOrBurnRateLimit(
    mutate self,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val details = lazy requestMsg.request.load().transfer.details.load();
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
    val details = lazy requestMsg.request.load().transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();

    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        self.releaseFastFinalityInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    } else {
        self.releaseInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    }
}

/// Unwinds an admitted lock/burn using only this transaction's inbound value.
fun TokenPool<T>.recoverLockOrBurnFailure(
    mutate self,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
    errorCode: int32,
    msgValue: coins,
    custodyReturn: AskToTransfer? = null,
): void {
    self.refundLockOrBurnRateLimit(forwardPayload);

    // Determine the failure value to send back based on whether custody return is required.
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val failureValue = custodyReturn != null
        ? requestMsg.finalizationValue
        : 0 as coins; // send remaining inbound value if no custody return is required

    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: failureValue,
        dest: requestMsg.replyTo,
        body: TokenPool_LockOrBurnFailure { queryId: requestMsg.queryId, errorCode },
    });

    if (custodyReturn != null) {
        val wallet = self.data.jettonClient().walletAddress();
        // A failed return uses a short bounce; the pool accepts the returned TON and never
        // enters the rich-bounce recovery handler.
        val transfer = createMessage({
            bounce: BounceMode.Only256BitsOfBody,
            value: 0,
            dest: wallet,
            body: custodyReturn,
        });

        // Funds are always returned best-effort, but the failure report is optional and
        // funded by the caller's failureValue. If it cannot be funded without starving the
        // return, skip it and return the remaining inbound value.
        val failureCost = failureValue + failure.estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);
        if (failureValue > 0 && msgValue > failureCost) {
            reserveBalanceBeforeInMessage(msgValue);
            failure.send(SEND_MODE_PAY_FEES_SEPARATELY);
            transfer.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            return;
        }

        transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
        return;
    }

    // No custody to return
    // Reserve the pre-message balance, then carry the remaining inbound value
    reserveBalanceBeforeInMessage(msgValue);
    failure.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/// Unwinds an admitted release/mint that failed downstream: refunds the inbound capacity consumed
/// at admission and notifies the requester. Shared by the concrete pools' account/withdraw/transfer
/// bounce handlers so the refund+notify pair is defined once.
fun TokenPool<T>.recoverReleaseOrMintFailure(
    mutate self,
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
    errorCode: int32,
    msgValue: coins,
): void {
    self.refundReleaseOrMintRateLimit(forwardPayload);

    val requestMsg = lazy forwardPayload.requestMsg.load();
    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: requestMsg.replyTo,
        body: TokenPool_ReleaseOrMintFailure { queryId: requestMsg.queryId, errorCode},
    });

    // Reserve the pre-message balance, then carry the remaining inbound value
    reserveBalanceBeforeInMessage(msgValue);
    failure.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/// Updates the token transfer fee configurations for specified destination chains.
/// @param updates Array of structs containing destination chain selectors and their fee configs.
/// @param disableChainSelectors Array of destination chain selectors to disable custom fee configs for.
fun TokenPool<T>.applyTokenTransferFeeConfigUpdates(
    mutate self,
    sender: address,
    msgValue: coins,
    queryId: uint64,
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>,
    disableChainSelectors: SnakedCell<uint64>,
) {
    // minval:check-bounce gate=S TokenPool_ApplyTokenTransferFeeConfigUpdates
    // TODO: A/dynamic - consider adding a cost function for this operation
    self.requireMinValue(msgValue);

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
    val adminConfig = lazy self.data.adminConfig.load();
    TokenPool<T>.ensureRequestedFinalityAllowed(requestedFinalityConfig, adminConfig.allowedFinalityConfig);

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
    val feeConfig = TokenPool<T>.enabledFeeConfig(self.data.tokenTransferFeeConfigs.get(details.remoteChainSelector));
    if (feeConfig == null) {
        return 0;
    }

    var transferFeeBps = feeConfig!.finalityTransferFeeBps;
    if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        transferFeeBps = feeConfig!.fastFinalityTransferFeeBps;
    }

    assert(transferFeeBps < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps); // Unexpected since it is validated in config update
    // SAFETY: Temporarily cast to int so compiler doesn't complain (all integers are `257`-bit signed `int`s in TVM's stack).
    // This product can't overflow because `details.amount` is 120 bits and `transferFeeBps` is 16 bits, so the product is at most 136 bits
    // const c = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF * 0xFFFF // MAX_UINT120 * MAX_UINT16 // Evaluated value: 0xFFFEFFFFFFFFFFFFFFFFFFFFFFFFFF0001 (136 bits)
    // SAFETY: Division result can be safely casted back to `coins` (`varuint120`) given
    // `transferFeeBps` is guaranteed to be less than `TOKEN_POOL_BPS_DIVIDER`, so the result will always be smaller than details.amount (`uint120`).
    return (details.amount as int * transferFeeBps as int) / TOKEN_POOL_BPS_DIVIDER; // TODO test case with max amount and max BPS to prove
}

/// Resolves a fee-config lookup to `TokenPool_TokenTransferFeeConfig?`: null unless the entry
/// exists and is enabled. Loads the dict value exactly once.
fun TokenPool<T>.enabledFeeConfig(entry: MapLookupResult<TokenPool_TokenTransferFeeConfig>): TokenPool_TokenTransferFeeConfig? {
    if (!entry.isFound) {
        return null;
    }

    val feeConfig = entry.loadValue();
    return feeConfig.isEnabled ? feeConfig : null;
}

/// Computes the pool's applicable fee config + the fee-adjusted (post-fee) amount for a
/// `TokenPool_GetCCVs` query, mirroring EVM's `getFee` + the outbound fee-subtraction in
/// `getRequiredCCVs`.
/// @return FeeContext with `feesProvided=false` when no enabled config exists (callers fall
///         back to FeeQuoter defaults); the inbound amount is already post-fee, so only
///         outbound subtracts the bps fee.
fun TokenPool<T>.getFeeParamsAndPostFeeAmount(
    self,
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: TokenPool_MessageDirection,
): TokenPool_FeeContext {
    val feeConfig = TokenPool<T>.enabledFeeConfig(self.data.tokenTransferFeeConfigs.get(remoteChainSelector));
    if (feeConfig == null) {
        // Mirrors EVM getFee: absent/disabled configs return a zero config with the disabled flag
        // (disabled entries cannot exist — updates reject isEnabled=false, disable deletes).
        val zeroConfig = TokenPool_TokenTransferFeeConfig {
            destGasOverhead: 0,
            destBytesOverhead: 0,
            finalityFeeUSDCents: 0,
            fastFinalityFeeUSDCents: 0,
            finalityTransferFeeBps: 0,
            fastFinalityTransferFeeBps: 0,
            isEnabled: false,
        };
        return TokenPool_FeeContext {
            feeConfig: zeroConfig,
            amountPostFee: sourceDenominatedAmount,
            feesProvided: false,
        };
    }

    var amountPostFee = sourceDenominatedAmount;

    // The source fee amount is not classified as transferred value: subtract it for outbound.
    if (direction == TokenPool_MessageDirection.Outbound) {
        var transferFeeBps = feeConfig!.finalityTransferFeeBps;
        if (requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
            transferFeeBps = feeConfig!.fastFinalityTransferFeeBps;
        }
        assert(transferFeeBps < TOKEN_POOL_BPS_DIVIDER, TokenPool_Error.InvalidTransferFeeBps);
        // SAFETY: `transferFeeBps` < TOKEN_POOL_BPS_DIVIDER (asserted), so the fee fraction is
        // < 1 and the subtraction is neither negative nor overflowing: still `coins`.
        amountPostFee = sourceDenominatedAmount - (sourceDenominatedAmount * transferFeeBps) / TOKEN_POOL_BPS_DIVIDER;
    }

    return TokenPool_FeeContext {
        feeConfig: feeConfig!,
        amountPostFee,
        feesProvided: true,
    };
}

/// Amount to pass to the CCV hooks for a transfer, mirroring EVM `getRequiredCCVs`:
/// - Outbound: the post-fee (source-denominated) amount.
/// - Inbound:  the amount converted to local decimals (via `extraData` `sourcePoolData`).
fun TokenPool<T>.getCCVAmount(
    self,
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: TokenPool_MessageDirection,
    extraData: cell?,
): coins {
    if (direction == TokenPool_MessageDirection.Outbound) {
        val fees = self.getFeeParamsAndPostFeeAmount(remoteChainSelector, sourceDenominatedAmount, requestedFinalityConfig, direction);
        return fees.amountPostFee;
    }

    val remoteDecimals = self.parseRemoteDecimals(extraData);
    return self.calculateLocalAmount(sourceDenominatedAmount as uint256, remoteDecimals);
}

/// Validate a CCV query's finality/token/chain, shared by `onGetCCVs`/`onGetCCVsAndFees`.
fun TokenPool<T>.validateGetCCVsRequest(
    self,
    localToken: address,
    remoteChainSelector: uint64,
    requestedFinalityConfig: uint32,
): void {
    val adminConfig = lazy self.data.adminConfig.load();
    TokenPool<T>.ensureRequestedFinalityAllowed(requestedFinalityConfig, adminConfig.allowedFinalityConfig);
    assert(self.isSupportedToken(localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(remoteChainSelector);
}

/// Handles an on-chain `TokenPool_GetCCVs` query: validates, then replies directly with an empty
/// CCV set (no hooks) or forwards to `advancedPoolHooks` and assembles the reply on the
/// `TokenPool_QueryCCVsReply` callback. `fees` selects the reply variant (null → CCVs, else CCVsAndFees).
fun TokenPool<T>.onGetCCVs(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_GetCCVs,
    fees: cell?,
): void {
    // minval:check-bounce gate=S TokenPool_GetCCVs
    // read-only CCV query; no custody
    self.requireMinValue(msgValue);

    self.validateGetCCVsRequest(msg.localToken, msg.remoteChainSelector, msg.requestedFinalityConfig);

    val context = TokenPool_GetCCVsContext {
        replyTo: sender,
        fwdPayload: msg.forwardPayload,
        fees,
    };

    val adminConfig = lazy self.data.adminConfig.load();
    val hooks = adminConfig.advancedPoolHooks;
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
    var emptyCCVs: array<address> = [];
    self.sendCCVsReply(sender, msg.queryId, emptyCCVs, context);
}

/// Handles an on-chain `TokenPool_GetCCVsAndFees` query: validates, then computes the fee
/// params and forwards through the shared `onGetCCVs` flow with the fees set.
fun TokenPool<T>.onGetCCVsAndFees(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_GetCCVsAndFees,
): void {
    // minval:check-bounce gate=S TokenPool_GetCCVsAndFees
    // read-only CCV+fees query; no custody
    self.requireMinValue(msgValue);

    self.validateGetCCVsRequest(msg.localToken, msg.remoteChainSelector, msg.requestedFinalityConfig);

    val fees = self.getFeeParamsAndPostFeeAmount(
        msg.remoteChainSelector, msg.amount, msg.requestedFinalityConfig, msg.direction
    ).toCell();

    self.onGetCCVs(sender, msgValue, TokenPool_GetCCVs {
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
    requiredCCVs: array<address>,
    context: TokenPool_GetCCVsContext,
): void {
    var body: cell;
    if (context.fees == null) {
        val fwdPayload = context.fwdPayload;
        body = TokenPool_CCVs { queryId, requiredCCVs, fwdPayload }.toCell();
    } else {
        val fees = context.fees! as Cell<TokenPool_FeeContext>;
        val fwdPayload = context.fwdPayload;
        body = TokenPool_CCVsAndFees { queryId, requiredCCVs, fees, fwdPayload}.toCell();
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: replyTo,
        body,
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
    errorCode: int32,
): void {
    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: replyTo,
        body: TokenPool_GetCCVsFailed { queryId, errorCode, fwdPayload },
    });
    failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handles the async `TokenPool_QueryCCVsReply` from `advancedPoolHooks`, assembling the final
/// reply to the original requester from the echoed context.
fun TokenPool<T>.onQueryCCVsReply(
    self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_QueryCCVsReply,
): void {
    val adminConfig = lazy self.data.adminConfig.load();
    val hooks = adminConfig.advancedPoolHooks;
    assert(hooks != null && hooks! == sender, TokenPool_Error.Unauthorized);
    assert(msg.replyPayload != null, TokenPool_Error.MissingForwardPayload);

    val context = lazy (msg.replyPayload! as Cell<TokenPool_GetCCVsContext>).load();
    try {
        self.requireMinValue(msgValue);
    } catch (errorCode) {
        self.sendCCVsFailed(context.replyTo, msg.queryId, context.fwdPayload, errorCode as int32);
        return;
    }

    self.sendCCVsReply(context.replyTo, msg.queryId, msg.requiredCCVs, context);
}

/// Handles a bounced `TokenPool_GetCCVs` forwarded to the hooks contract, finalizing the
/// query by sending `TokenPool_GetCCVsFailed` (carrying the TVM `exitCode`) to the original
/// requester via the echoed context. Called from the shared base `TokenPool.onBouncedMessage`.
fun TokenPool<T>.onGetCCVsBounced(
    self,
    msg: TokenPool_GetCCVs,
    exitCode: int32,
): void {
    if (msg.forwardPayload == null) {
        return; // no requester to notify
    }

    val context = lazy (msg.forwardPayload! as Cell<TokenPool_GetCCVsContext>).load();
    self.sendCCVsFailed(context.replyTo, msg.queryId, context.fwdPayload, exitCode);
}

/// Validates the lock or burn input for correctness on
/// - token to be locked or burned
/// - RMN curse status
/// - if the sender is the configured Router
/// - rate limiting for either default or FTF transfer messages.
/// - preflight checks hooks (if enabled)
/// 
/// @param sender The address of the original sender of the lock or burn request.
/// @param msg The full LockOrBurn message containing all request fields.
/// 
/// @dev This function should always be called before executing a lock or burn. Not doing so would
/// allow for various exploits.
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

    val request = lazy msg.request.load();
    val details: TokenPool_TransferDetails<address, Cell<CrossChainAddress>, coins> = lazy request.transfer.details.load();
    assert(self.isSupportedToken(details.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(details.remoteChainSelector);
    self.ensureNotCursed(details.remoteChainSelector);
    self.onlyRouter(sender);

    val feeAmount = self.getFeeAmount(request.transfer, msg.requestedFinalityConfig);
    val destTokenAmount = details.amount - feeAmount;
    // Consume rate limit BEFORE hook check — _consume throws BucketOverfilled
    // designed to bounce to the original sender, not to the hooks contract.
    if (msg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        val adminConfig = lazy self.data.adminConfig.load();
        TokenPool<T>.ensureRequestedFinalityAllowed(msg.requestedFinalityConfig, adminConfig.allowedFinalityConfig);
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
    msgValue: coins,
    msg: TokenPool_LockOrBurn,
): void {
    // The inbound value must cover the TP admission plus the caller-provided finalization value.
    // The client adds a relay buffer so the pool receives the full `A + F`.; `budget()` clamps
    // `A` to at least `3S`, so this is also the pre-withdraw `3S + F` gate.
    // This gate runs before the operation hook, so an override cannot skip admission.
    assertMinValue(
        msgValue,
        self.budget().lockOrBurn.admission + msg.finalizationValue,
        TokenPool_Error.InsufficientMessageValue,
    );

    // minval:check-bounce gate=A/static TokenPool_LockOrBurn
    // The caller's success/failure continuation completes the flow, so it must carry value.
    assertMinValue(
        msg.finalizationValue,
        TokenPool_Costs.callerFinalization(),
        TokenPool_Error.InsufficientMessageValue,
    );

    if (self.hooks != null && self.hooks.onLockOrBurn != null) {
        self.context = self.hooks.onLockOrBurn(self.context!, sender, msg);

        return;
    }

    self.updateDepositNamespaces(sender, msg.onRampNamespaces);

    // Validate and call preflightCheck with full message.
    val (wait, prepared) = self.validateLockOrBurn(sender, msg);

    if (wait) {
        return; // Async hook was triggered; will resume via onPreflightCheckFinished/Failed.
    }

    // Defense-in-depth: `budget()` guarantees `A >= 3S`, and the entry gate above checked
    // `A + F`, so this cannot fail unless that invariant is broken. Kept explicit, without a
    // second minval marker.
    val custodyMoves = LB_CUSTODY_MOVES_BEFORE_WITHDRAW;
    val minValue = self.custodyForward(custodyMoves, msg.finalizationValue);
    assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);

    self.onLockOrBurnWithdraw(sender, msgValue, msg, prepared);
}

/// Replaces the pool's allowed deposit namespaces with the set relayed by the Router on a
/// `TokenPool_LockOrBurn`. Only the configured Router may relay it.
fun TokenPool<T>.updateDepositNamespaces(
    mutate self,
    sender: address,
    onRampNamespaces: map<uint32, ()>,
): void {
    var adminConfig = lazy self.data.adminConfig.load();
    val dynamicConfig = lazy adminConfig.dynamicConfig.load();
    if (sender != dynamicConfig.router) {
        return;
    }

    adminConfig.allowedDepositNamespaces = onRampNamespaces;
    self.data.adminConfig = adminConfig.toCell();
}

/// Handles the withdrawal step after a lock or burn operation has been prepared/checked.
fun TokenPool<T>.onLockOrBurnWithdraw(
    mutate self,
    sender: address, // original sender of the lock or burn request
    msgValue: coins,
    msg: TokenPool_LockOrBurn,
    prepared: TokenPool_LockOrBurnPrepared,
): void {
    // TODO: expose as a hook

    val forwardPayload = TokenPool_LockOrBurnForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val queryId = msg.queryId;
    val custodyMoves = LB_CUSTODY_MOVES_BEFORE_LOCK_BURN; // = 2; expected budget before final lock/burn
    val forwardTonAmount = self.custodyForward(custodyMoves, msg.finalizationValue);
    val withdrawalMsg = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: msg.replyTo,
        body: TokenPool_LockOrBurnWithdraw { queryId, forwardTonAmount, forwardPayload},
    });

    // Reserve the pre-message balance, then carry the remaining inbound value
    reserveBalanceBeforeInMessage(msgValue);
    withdrawalMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Contains the specific lock or burn token logic for a pool.
/// @dev overriding this method allows us to create pools with different lock/burn signatures
/// without duplicating the underlying logic.
fun TokenPool<T>.onLockOrBurnTransfer(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TransferNotificationForRecipient,
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
        // Only callable by authorized router-owned deployables (see assertAuthorizedDepositInitiator).

        val wrapper = Jetton_ForwardPayloadWrap.from(msg.forwardPayload)!;
        val fwdp = TokenPool_LockOrBurnForwardPayload.fromCell(wrapper.forwardPayload!);

        self.processLockOrBurnTransfer(sender, msgValue, msg, fwdp, wrapper.initiator);
    } catch {
        // Malformed or unauthenticated payloads cannot authorize a capacity refund or reply.
        // Custody can still be returned if the notification funds recovery.
        val returnTransfer = TokenPool<T>.buildReturnTransfer(msg);
        if (returnTransfer == null) {
            return;
        }

        val transfer = createMessage({
            bounce: BounceMode.Only256BitsOfBody,
            value: 0,
            dest: sender, // wallet that sent the original transfer
            body: returnTransfer!,
        });

        transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
    }
}

/// Process a decoded Jetton transfer notification after its sender has been authenticated.
fun TokenPool<T>.processLockOrBurnTransfer(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TransferNotificationForRecipient,
    fwdp: TokenPool_LockOrBurnForwardPayload,
    withdrawalInitiator: address,
): void {
    val requestMsg = lazy fwdp.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();

    assert(msg.transferInitiator != null, TokenPool_Error.MissingTransferInitiator);
    self.assertAuthorizedDepositInitiator(msg.transferInitiator, withdrawalInitiator, details.originalSender);

    try {
        // minval:check-fail gate=S LockReleaseLockboxTokenPool.TransferNotificationForRecipient
        // Ensure the message value covers the expected custody moves + finalization
        // We expect a budget of two custody moves before lock/burn (`2S + F`).
        val custodyMoves = LB_CUSTODY_MOVES_BEFORE_LOCK_BURN;
        val minValue = self.custodyForward(custodyMoves, requestMsg.finalizationValue);
        assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);

        // TODO: do we assert exact amount?
        assert(details.amount == msg.jettonAmount, TokenPool_Error.AmountMismatch);
        self.onLockOrBurnTransferContinue(sender, msgValue, msg, fwdp);
    } catch (errorCode) {
        val custodyReturn = TokenPool<T>.buildReturnTransfer(msg);
        self.recoverLockOrBurnFailure(fwdp, errorCode, msgValue, custodyReturn);
    }
}

/// Verifies that a deposit was initiated by a trusted source before the pool accepts custody.
///
/// @param transferInitiator The wallet owner that initiated the inbound Jetton transfer.
/// @param withdrawalInitiator The address that requested the DepositAccount to make the transfer.
/// @param originalSender The original CCIP sender on the source chain, used to derive its
///        Router-owned account.
///
/// @dev Accepts an OnRampAccount deposit account in an allowed namespace for (originalSender,
///        the pool's jetton master), so an account holding a different jetton never authenticates here.
///
///      The `withdrawalInitiator == Router` check is what makes the forward payload trustworthy:
///      a deposit-account beneficiary could otherwise withdraw (to this pool) with an arbitrary
///      payload and spoof a transfer the Router never admitted. Account-auth is opt-in: it is
///      only enforced once the pool owner configures it (allowed namespaces).
fun TokenPool<T>.assertAuthorizedDepositInitiator(
    self,
    transferInitiator: address,
    withdrawalInitiator: address,
    originalSender: address,
): void {
    val adminConfig = lazy self.data.adminConfig.load();
    val dynamicConfig = lazy adminConfig.dynamicConfig.load();
    val router = dynamicConfig.router;

    // Look through all allowed namespace/account types for one that derives to `initiator`.
    var entry = adminConfig.allowedDepositNamespaces.findFirst();
    while (entry.isFound) {
        val namespace: Namespace = entry.getKey();
        val account = self.deriveDepositAccount(
            router,
            namespace,
            originalSender,
        ).calculateAddress();
        if (transferInitiator == account) {
            // Once we have verified that the transfer initiator matches a derived deposit account,
            // we must ensure that the withdrawal initiator is the Router itself so we can trust the
            // forward payload
            assert (withdrawalInitiator == router) throw TokenPool_Error.Unauthorized;
            return;
        }

        entry = adminConfig.allowedDepositNamespaces.iterateNext(entry);
    }

    throw TokenPool_Error.Unauthorized;
}

/// Derives the address of `router`'s deposit account in a `namespace`
@inline
fun TokenPool<T>.deriveDepositAccount(
    self,
    router: address,
    namespace: Namespace,
    user: address,
): AutoDeployAddress {
    val adminConfig = lazy self.data.adminConfig.load();

    val id = Router_DepositAccountID { user, token: adminConfig.jettonClient.masterAddress };
    return NamespacedDeployableAddress<Router_DepositAccountID>(deployableCompiledCode(), { namespace, owner: router, id });
}

fun TokenPool<T>.onLockOrBurnTransferContinue(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    if (self.hooks != null) {
        // Every concrete pool must implement this post-custody continuation
        self.context = self.hooks.onLockOrBurnTransferContinue(self.context!, sender, msgValue, msg, fwdPayload);

        return;
    }

    throw TokenPool_Error.UnsupportedOperation;
}

fun TokenPool<T>.createCustodyReturn(forwardPayload: TokenPool_LockOrBurnForwardPayload): AskToTransfer {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val details = lazy requestMsg.request.load().transfer.details.load();
    return AskToTransfer {
        queryId: requestMsg.queryId,
        jettonAmount: details.amount,
        transferRecipient: details.originalSender,
        sendExcessesTo: details.originalSender,
        customPayload: null,
        forwardTonAmount: 0,
        forwardPayload: beginCell().storeMaybeRef(null).endCell().beginParse(),
    };
}

/// Returns an `AskToTransfer` message to return the transferred tokens to the initiator,
/// or `null` if no return is possible (e.g., to minter - a null transfer initiator)
fun TokenPool<T>.buildReturnTransfer(msg: TransferNotificationForRecipient): AskToTransfer? {
    if (msg.transferInitiator == null || msg.jettonAmount == 0) {
        return null;
    }

    val transfer = AskToTransfer {
        queryId: msg.queryId,
        jettonAmount: msg.jettonAmount,
        transferRecipient: msg.transferInitiator!,
        sendExcessesTo: msg.transferInitiator,
        customPayload: null,
        forwardTonAmount: 0,
        forwardPayload: beginCell()
            .storeMaybeRef(null)
            .endCell()
            .beginParse(),
    };

    return transfer;
}

fun TokenPool<T>.onLockOrBurnTransferFinalize(
    mutate self,
    msgValue: coins,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): void {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();

    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    emit(TOPIC_TOKEN_POOL_LOCKED_OR_BURNED, TokenPool_LockedOrBurned {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_LockedOrBurnedDetails {
            token: details.localToken,
            sender: fwdPayload.originalSender,
            amount: prepared.destTokenAmount,
        }.toCell(),
    });

    val finished = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: requestMsg.replyTo,
        body: TokenPool_LockOrBurnFinished {
            queryId: requestMsg.queryId,
            out: prepared.out.toCell(),
            destTokenAmount: prepared.destTokenAmount,
        },
    });

    // Reserve the pre-message balance, then carry the remaining inbound value
    reserveBalanceBeforeInMessage(msgValue);
    finished.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/// Validates the release or mint input for correctness on
/// - token to be released or minted
/// - RMN curse status
/// - if the sender is the configured Router
/// - if the source pool is configured for the remote chain
/// - rate limiting for either default or FTF transfer messages.
/// - postflight checks hooks (if enabled)
///
/// @param msg The full ReleaseOrMint message containing all request fields.
///
/// @dev This function should always be called before executing a release or mint. Not doing so
/// would allow for various exploits.
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

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    assert(self.isSupportedToken(details.localToken), TokenPool_Error.InvalidToken);
    self.requireSupportedChain(details.remoteChainSelector);
    self.ensureNotCursed(details.remoteChainSelector);
    self.onlyRouter(sender);
    assert(self.isRemotePool(details.remoteChainSelector, request.sourcePoolAddress), TokenPool_Error.InvalidRemotePoolForChain);

    val remoteDecimals = self.parseRemoteDecimals(request.sourcePoolData);
    val localAmount = self.calculateLocalAmount(details.amount, remoteDecimals);

    // Consume rate limit BEFORE hook check — _consume throws BucketOverfilled
    // designed to bounce to the original sender, not to the hooks contract.
    if (msg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        val adminConfig = lazy self.data.adminConfig.load();
        TokenPool<T>.ensureRequestedFinalityAllowed(msg.requestedFinalityConfig, adminConfig.allowedFinalityConfig);
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
    msgValue: coins,
    msg: TokenPool_ReleaseOrMint,
): void {
    // The message value is checked for admission plus the caller's finalization.
    // This gate runs before the operation hook, so an override cannot skip admission.
    var minValue = self.budget().releaseOrMint.admission + msg.finalizationValue();
    assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);

    // The recipient's notification completes a delivery, so it must carry value.
    minValue = TokenPool_Costs.callerFinalization();
    assertMinValue(msg.finalizationValue(), minValue, TokenPool_Error.InsufficientMessageValue);

    if (self.hooks != null && self.hooks.onReleaseOrMint != null) {
        self.context = self.hooks.onReleaseOrMint(self.context!, msg);

        return;
    }

    // Validate and call postflightCheck with full message.
    val (wait, prepared) = self.validateReleaseOrMint(sender, msg);

    if (wait) {
        return; // Async hook was triggered; will resume via onPostflightCheckFinished/Failed.
    }

    // minval:check-bounce gate=A/static TokenPool_ReleaseOrMint
    // Defense-in-depth: release admission is clamped to at least `S`, so the entry `A + D` gate
    // already covers the pool's `S + D` delivery forward. Kept explicit, without a second
    // minval marker.
    // TODO: should be V > 2 * S + F
    minValue = self.releaseOrMintForward(msg.finalizationValue());
    assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);

    self.onReleaseOrMintContinue(sender, msgValue, msg, prepared);
}

fun TokenPool<T>.onReleaseOrMintContinue(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): void {
    if (self.hooks != null) {
        // Every concrete pool must implement this post-hooks continuation
        self.context = self.hooks.onReleaseOrMintContinue(self.context, sender, msgValue, msg, prepared);

        return;
    }

    throw TokenPool_Error.UnsupportedOperation;
}

/// Emits `ReleasedOrMinted` once the Router reports that the ReceiveExecutor observed the
/// released/minted tokens arrive at the receiver's deposit account, then confirms to the executor.
fun TokenPool<T>.onReleaseOrMintDelivered(
    self,
    sender: address,
    msgValue: coins,
    msg: TokenPool_ReleaseOrMintDelivered,
): void {
    self.onlyRouter(sender);

    val transfer = lazy msg.transfer.load();
    assert(self.isSupportedToken(transfer.localToken), TokenPool_Error.InvalidToken);

    // minval:non-reject gate=none TokenPool_ReleaseOrMintDelivered
    // minval.detail: release committed; authenticate and complete, no reversal exists

    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: transfer.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: transfer.localToken,
            sender,
            amount: transfer.amount,
            recipient: transfer.receiver.toCell(),
        }.toCell(),
    });

    val finalized = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: msg.replyTo,
        body: TokenPool_ReleaseOrMintFinalized {
            queryId: msg.queryId,
            out: TokenPool_ReleaseOrMintOutV1 { destinationAmount: transfer.amount }.toCell(),
        },
    });

    // Reserve the pre-message balance, then carry the remaining inbound value
    reserveBalanceBeforeInMessage(msgValue);
    finalized.send(SEND_MODE_CARRY_ALL_BALANCE);
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
    val adminConfig = lazy self.data.adminConfig.load();
    val dynamicConfig = lazy adminConfig.dynamicConfig.load();
    val ownable = lazy adminConfig.ownable.load();
    val senderIsRateLimitAdmin = fun () {
        return dynamicConfig.rateLimitAdmin != null
            && sender == dynamicConfig.rateLimitAdmin;
    };
    assert(
        sender == ownable.owner || senderIsRateLimitAdmin(),
        TokenPool_Error.Unauthorized
    );
}

/// Restricts CCIP token operations to the configured Router. The Router owns ramp authentication
/// and applies its own RMN policy; the pool applies its local cursed-subject policy independently.
fun TokenPool<T>.onlyRouter(self, sender: address) {
    val adminConfig = lazy self.data.adminConfig.load();
    val dynamicConfig = lazy adminConfig.dynamicConfig.load();
    assert(sender == dynamicConfig.router, TokenPool_Error.Unauthorized);
}

/// Authenticates asynchronous pool-hook continuations. Without this boundary,
/// an arbitrary sender could forge a success/failure continuation after the
/// Router-authenticated operation returned to the async flow.
fun TokenPool<T>.onlyAdvancedPoolHooks(self, sender: address) {
    val adminConfig = lazy self.data.adminConfig.load();
    val hooks = adminConfig.advancedPoolHooks;
    assert(hooks != null && sender == hooks!, TokenPool_Error.Unauthorized);
}

/// Checks the pool-local RMN policy at admission.
///
/// The pool's independent curse policy is the TON analogue of EVM's per-pool `i_rmnProxy`
/// (owner-configurable). It is evaluated only when the Router admits the operation; async
/// continuations deliberately do not re-check.
fun TokenPool<T>.ensureNotCursed(self, remoteChainSelector: uint64) {
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
    val adminConfig = lazy self.data.adminConfig.load();
    val hooks = adminConfig.advancedPoolHooks;
    if (hooks != null) {
        // amountPostFee is already computed in fwdPayload.prepared.destTokenAmount.
        val prepared = lazy fwdPayload.prepared.load();

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
    val adminConfig = lazy self.data.adminConfig.load();
    val hooks = adminConfig.advancedPoolHooks;
    if (hooks != null) {
        // localAmount is already computed in fwdPayload.prepared.localAmount.
        val prepared = lazy fwdPayload.prepared.load();

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
    bucket.consume(amount as uint256, self.data.token());
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
    bucket.consume(amount as uint256, self.data.token());
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
    bucket.refund(amount as uint256);
    rateLimiters.outbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_OUTBOUND_RATE_LIMIT_REFUNDED, TokenPool_OutboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    }, SEND_MODE_IGNORE_ERRORS);
}

/// Returns previously consumed inbound capacity to the bucket when an inbound operation
/// fails after admission (e.g. a release transfer bounces). Mirrors `consumeInboundRateLimit`.
/// @dev Fast-finality refunds require the requested finality to be recovered from the
/// pending operation; deferred until FTF is enabled (see TON-TP/16).
fun TokenPool<T>.releaseInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var rateLimiters = config.rateLimiters.load();
    var bucket = rateLimiters.inbound.load();
    bucket.refund(amount as uint256);
    rateLimiters.inbound = bucket.toCell();
    config.rateLimiters = rateLimiters.toCell();
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_INBOUND_RATE_LIMIT_REFUNDED, TokenPool_InboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    }, SEND_MODE_IGNORE_ERRORS);
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
        bucket.refund(amount as uint256);
        rateLimiters.outbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket.refund(amount as uint256);
        fastRateLimiters.outbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_OUTBOUND_RATE_LIMIT_REFUNDED, TokenPool_FastFinalityOutboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    }, SEND_MODE_IGNORE_ERRORS);
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
        bucket.refund(amount as uint256);
        rateLimiters.inbound = bucket.toCell();
        config.rateLimiters = rateLimiters.toCell();
    } else {
        fastBucket.refund(amount as uint256);
        fastRateLimiters.inbound = fastBucket.toCell();
        config.fastFinalityRateLimiters = fastRateLimiters.toCell();
    }
    self.data.remoteChainConfigs.set(remoteChainSelector, config);

    emit(TOPIC_TOKEN_POOL_FAST_FINALITY_INBOUND_RATE_LIMIT_REFUNDED, TokenPool_FastFinalityInboundRateLimitRefunded {
        remoteChainSelector,
        token: self.data.token(),
        amount,
    }, SEND_MODE_IGNORE_ERRORS);
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
        return;
    }

    fastBucket.consume(amount as uint256, self.data.token());
    fastRateLimiters.outbound = fastBucket.toCell();
    config.fastFinalityRateLimiters = fastRateLimiters.toCell();
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
fun TokenPool<T>.consumeFastFinalityInboundRateLimit(mutate self, remoteChainSelector: uint64, amount: coins) {
    var config = self.data.remoteChainConfigs.mustGet(remoteChainSelector, TokenPool_Error.NonExistentChain as int);
    var fastRateLimiters = config.fastFinalityRateLimiters.load();
    var fastBucket = fastRateLimiters.inbound.load();
    if (!fastBucket.isEnabled) {
        self.consumeInboundRateLimit(remoteChainSelector, amount);

        return;
    }

    fastBucket.consume(amount as uint256, self.data.token());
    fastRateLimiters.inbound = fastBucket.toCell();
    config.fastFinalityRateLimiters = fastRateLimiters.toCell();
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
    msgValue: coins,
    queryId: uint64,
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>,
) {
    // minval:check-bounce gate=S TokenPool_SetRateLimitConfig
    // owner/rate-limit-admin config
    // TODO: A/dynamic - loops over updates; a static S does not bound large inputs
    self.requireMinValue(msgValue);

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
    assert(!TokenPool<T>.isEmptyCrossChainAddress(remotePoolAddress), TokenPool_Error.ZeroAddressInvalid);
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

    // minval:check-bounce gate=S JettonWithdrawable_Withdraw
    // owner/fee-admin fee relay; replacement hook owns its funding policy
    // TODO: A/dynamic - loops over the withdrawal list; a static S does not bound large inputs
    self.requireMinValue(msgValue);

    // No cap by default (the jetton wallet's physical balance is the only bound); can be
    // specialized by the hook (e.g. lock/release, whose accrued-fee ledger bounds the withdrawal).
    self.withdrawFeeTokens(sender, msgValue, msg, null);
}

/// Withdraws accrued fee jettons.
/// @dev Only callable by the owner or the configured fee admin.
/// @param sender The caller; must be the owner or fee admin.
/// @param msgValue The TON value carried by the inbound withdrawal message; must cover the sum of
///     the relayed transfer values + reserve (validated in `JettonWithdrawable.onWithdraw`).
/// @param msg The withdrawal request (wallet + transfer pairs).
/// @param maxAmount Per-wallet upper bound on the cumulative amount relayed (cap); `null` = unbounded.
/// @return The per-wallet total jetton amount relayed (for caller bookkeeping).
fun TokenPool<T>.withdrawFeeTokens(
    mutate self,
    sender: address,
    msgValue: coins,
    msg: JettonWithdrawable_Withdraw,
    maxAmount: map<address, coins>?,
): map<address, coins> {
    assert(self.onlyOwnerOrFeeAdmin(sender), TokenPool_Error.CallerIsNotOwnerOrFeeAdmin);

    // No recipient allowlist: access is gated by onlyOwnerOrFeeAdmin above
    return JettonWithdrawable.onWithdraw(msgValue, sender, msg, maxAmount, null);
}

/// Whether the caller is the owner or the fee admin
fun TokenPool<T>.onlyOwnerOrFeeAdmin(self, sender: address): bool {
    val adminConfig = lazy self.data.adminConfig.load();
    val dynamicConfig = lazy adminConfig.dynamicConfig.load();
    val ownable = lazy adminConfig.ownable.load();
    val senderIsFeeAdmin = fun () {
        return dynamicConfig.feeAdmin != null
            && sender == dynamicConfig.feeAdmin;
    };
    return sender == ownable.owner || senderIsFeeAdmin();
}

/// Ensures a requested finality config is allowed by the pool's allowed finality (see `FinalityCodec`).
fun TokenPool<T>.ensureRequestedFinalityAllowed(requestedFinalityConfig: uint32, allowedFinalityConfig: uint32): void {
    if (requestedFinalityConfig == TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        return;
    }
    assert(allowedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG && requestedFinalityConfig == allowedFinalityConfig, TokenPool_Error.InvalidRequestedFinality);
}

fun TokenPool<T>.isEmptyCrossChainAddress(value: Cell<CrossChainAddress>): bool {
    var cs = value.beginParse();
    val addressBytes = CrossChainAddress.unpackFromSlice(mutate cs);
    cs.assertEnd();
    return addressBytes.remainingBitsCount() == 0;
}

fun TokenPool<T>.boxCrossChainAddress(addressBytes: CrossChainAddress): Cell<CrossChainAddress> {
    var addressSlice = addressBytes;
    val bits = addressSlice.remainingBitsCount();
    assert(bits % 8 == 0, TokenPool_Error.OverflowDetected);
    val pureAddressBits = addressSlice.loadBits(bits);
    return beginCell()
        .storeUint(bits / 8, 8)
        .storeSlice(pureAddressBits)
        .endCell() as Cell<CrossChainAddress>;
}
