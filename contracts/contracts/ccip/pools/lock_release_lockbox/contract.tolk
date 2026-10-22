// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "@stdlib/lisp-lists"
import "@stdlib/gas-payments"

import "../../../lib/utils"
import "../../../lib/access/access_control"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/forward_payload_wrap"
import "../../../lib/funding/jetton_withdrawable"

import "../../common/types"
import "../../rmn_remote/lib"

import "../lib/token_pool/entrypoint"
import "../lib/token_pool/budget"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/errors"
import "../lib/token_pool/events"
import "../lockbox/messages"

import "types"
import "messages"
import "storage"


contract LockReleaseLockboxTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.LockReleaseLockboxTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseLockboxTokenPool_InMessage
    outgoingMessages:
        | TokenPool_OutMessage
        | LockReleaseLockboxTokenPool_OutMessage

    emittedEvents: TokenPool_Events

    forceAbiExport: (
        LockReleaseLockboxTokenPool_LockContext,
        LockReleaseLockboxTokenPool_ReleaseContext,
        AccessControl_InMessage
    )
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

fun onInternalMessage(in: InMessage): void {
    var st = Storage.load();
    var pool = loadPool(st);
    val handled = pool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);
    if (handled) {
        st = pool.context != null ? pool.context! : st;
        st.poolData = pool.data.toCell();
        st.store();

        return;
    }

    val msg = lazy LockReleaseLockboxTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        JettonLockBox_Deposited => {
            onDeposited(mutate st, in.senderAddress, msg);
            st.store();
        }
        JettonLockBox_DepositFailed => {
            onDepositFailed(mutate st, in.senderAddress, in.valueCoins, msg);
            st.store();
        }
        JettonLockBox_WithdrawFailed => {
            onWithdrawFailed(mutate st, in.senderAddress, in.valueCoins, msg);
            st.store();
        }
        ReturnExcessesBack => {
            // minval:best-effort gate=none ReturnExcessesBack
            // passive excess receipt; retain coins without advancing an operation or granting authority
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Handles bounced lock (deposit) messages: returns jettons and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    var st = Storage.load();

    // Base library first recovers the messages it emits (GetCCVs query, LockOrBurnWithdraw).
    var basePool = loadPool(st);
    if (basePool.onBouncedMessage(in.senderAddress, in.valueCoins, in.bouncedBody)) {
        st.poolData = basePool.data.toCell();
        st.store();
        return;
    }

    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy LockReleaseLockboxTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        AskToTransfer => {
            // Distinguish a fee-withdrawal `AskToTransfer` (tagged with a `WithdrawContext`) from a
            // lock `AskToTransfer` (tagged with a `LockContext`).
            val data = st.poolData.load();
            val jc = data.jettonClient();
            if (JettonWithdrawable.onWithdrawBounced(jc.walletAddress(), msg)) {
                assert(jc.isWallet(in.senderAddress)) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
                st.store();

                return;
            }

            onLockTransferBounced(mutate st, in.senderAddress, in.valueCoins, msg);
            st.store();
        }
        // The lockbox rejected the withdraw request at entry, so no JettonLockBox_WithdrawFailed
        // follows. Unwind the admitted release from the context we embedded in `extra.forwardPayload`.
        JettonLockBox_Withdraw => {
            assert(in.senderAddress == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
            recoverReleaseFromLockboxWithdraw(mutate st, msg, in.valueCoins);
            st.store();
        }
    }
}

/* === Lock (deposit) flow === */
/*
 * Flow:
 * 1. Router sends TokenPool_LockOrBurn + jettons via TransferNotificationForRecipient
 * 2. TokenPool library processes validation, calls onLockOrBurnTransferContinue
 * 3. We transfer jettons from our wallet to the lockbox
 * 4. Lockbox confirms the deposit directly to the pool
 * 5. The confirmation carries the lock context and we finalize
 */

fun onLockOrBurnTransferContinue(
    st: Storage,
    _sender: address,
    _msgValue: coins, // the custody forward: two custody phases' safety
    msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    // The last custody move carries one custody phase's safety plus the CCIP failure budget.
    // The rest pays this transfer, whose wallet rejects an underfunded transfer before custody moves.
    val safety = loadPool(st).budget().lockOrBurn.safety;
    val requestMsg = lazy fwdPayload.requestMsg.load();
    // On rejection the lockbox returns custody straight to the original sender.
    lockTransfer(st, fwdPayload, msg.transferInitiator, safety + requestMsg.failureValue)
        .send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return st;
}

/// Moves the locked custody from the pool's wallet to the lockbox, forwarding `forwardTonAmount`
/// with the deposit.
fun lockTransfer(
    st: Storage,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
    returnAddress: address?,
    forwardTonAmount: coins,
): OutMessage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();
    val requestInV1 = lazy requestMsg.request.load();
    val requestDetails = lazy requestInV1.transfer.details.load();
    val jc = st.poolData.load().jettonClient();

    val context = LockReleaseLockboxTokenPool_LockContext {
        forwardPayload: fwdPayload.toCell(),
    };
    val depositMsg = JettonLockBox_Deposit {
        queryId: requestMsg.queryId,
        token: jc.masterAddress,
        remoteChainSelector: requestDetails.remoteChainSelector,
        amount: prepared.destTokenAmount,
        context: context.toCell(),
        returnAddress,
        failureValue: requestMsg.failureValue,
    };
    return createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: jc.walletAddress(),
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            transferRecipient: st.lockbox,
            sendExcessesTo: contract.getAddress(),
            customPayload: context.toCell(),
            forwardTonAmount,
            forwardPayload: beginCell().storeMaybeRef(depositMsg.toCell()).endCell().beginParse(),
        },
    });
}

/* --- Bounced AskToTransfer during lock --- */

fun onDeposited(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_Deposited,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);

    // minval:non-reject gate=none JettonLockBox_Deposited
    // lockbox owns custody; authenticate and complete, no reversal path exists

    var pool = loadPool(st);
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.context!);
    pool.onLockOrBurnTransferFinalize(context.forwardPayload.load());
}

fun validateRejectedDeposit(st: Storage, msg: JettonLockBox_DepositFailed): TokenPool_LockOrBurnForwardPayload {
    val data = st.poolData.load();
    assert(msg.token == data.token() && msg.depositor == contract.getAddress(),
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    val deposit = msg.context!.load();
    assert(deposit.queryId == msg.queryId && deposit.token == msg.token && deposit.amount == msg.amount
        && deposit.context != null,
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    val context = LockReleaseLockboxTokenPool_LockContext.fromCell(deposit.context!);
    val operation = context.forwardPayload.load();
    val request = lazy operation.requestMsg.load();
    val details = lazy request.request.load().transfer.details.load();
    val prepared = lazy operation.prepared.load();
    assert(request.queryId == msg.queryId && details.localToken == msg.token
        && prepared.destTokenAmount == msg.amount,
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    return operation;
}

fun onDepositFailed(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    msg: JettonLockBox_DepositFailed,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);

    // minval:recovery gate=none JettonLockBox_DepositFailed
    // lock unwind when lockbox deposit is rejected
    // TODO: the lockbox returns only the post-fee `destTokenAmount` to `returnAddress`, so the CCIP
    //       fee is retained by the pool on rejection. Refund the fee (details.amount - destTokenAmount)
    //       to the original sender to make the sender whole.

    if (msg.context == null) {
        return;
    }

    val operation = validateRejectedDeposit(st, msg);
    var pool = loadPool(st);
    pool.recoverLockOrBurnFailure(operation, msg.errorCode, msgValue);
    st.poolData = pool.data.toCell();
}

fun onLockTransferBounced(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    msg: AskToTransfer,
) {
    val jc = st.poolData.load().jettonClient();
    assert(jc.isWallet(sender)) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    assert(msg.customPayload != null) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.customPayload!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    val custodyReturn = TokenPool<void>.createCustodyReturn(operation);
    val exitCode = LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce as int32;
    pool.recoverLockOrBurnFailure(operation, exitCode, msgValue, custodyReturn);
    st.poolData = pool.data.toCell();
}

/* === Release (withdraw) flow === */
/*
 * Flow:
 * 1. Router deploys the receiver's deposit account and sends TokenPool_ReleaseOrMint
 * 2. TokenPool library validates, calls onReleaseOrMintContinue
 * 3. We send JettonLockBox_Withdraw to the lockbox, targeting the receiver's deposit account
 * 4. Lockbox sends AskToTransfer from its jetton wallet to the account's jetton wallet
 * 5. The account forwards the notification to the ReceiveExecutor, which finalizes the transfer
 * 6. On error, the lockbox sends JettonLockBox_WithdrawFailed directly to the pool
 */

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msgValue: coins,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    assert(msg.delivery != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;
    val delivery = msg.delivery!.load();
    assert(st.lockbox != createAddressNone(), LockReleaseLockBoxTokenPool_Error.LockBoxNotConfigured);

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val context = LockReleaseLockboxTokenPool_ReleaseContext {
        forwardPayload: forwardPayload.toCell(),
    };

    // The release context rides along in the wrap only for the lockbox failure path.
    val wrap = Jetton_ForwardPayloadWrap {
        initiator: sender,
        context: context.toCell(),
        forwardPayload: delivery.forwardPayload,
    };

    // The recipient's notification carries the pool's finalization safety plus the caller's
    // continuation; the rest pays the lockbox and its wallet transfer. Both check their own cost
    // and reject an underfunded withdraw before custody moves.
    val jc = st.poolData.load().jettonClient();
    val forwardTonAmount = loadPool(st).releaseOrMintForward(msg);
    val withdraw = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.lockbox,
        body: JettonLockBox_Withdraw {
            queryId: msg.queryId,
            token: jc.masterAddress,
            remoteChainSelector: details.remoteChainSelector,
            amount: prepared.localAmount,
            recipient: delivery.recipient,
            extra: JettonLockBox_WithdrawExtra {
                sendExcessesTo: contract.getAddress(),
                forwardTonAmount,
                forwardPayload: wrap.toCell(),
            }.toCell(),
        },
    });
    withdraw.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    return st;
}

fun onWithdrawFailed(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    msg: JettonLockBox_WithdrawFailed,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed);

    // minval:recovery gate=none JettonLockBox_WithdrawFailed
    // release unwind when lockbox withdraw fails

    val poolData = st.poolData.load();
    val withdraw = msg.context!.load();
    val isValid = withdraw.queryId == msg.queryId
        && withdraw.token == msg.token
        && msg.token == poolData.token();
    assert(isValid, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed);
    recoverReleaseFromLockboxWithdraw(mutate st, withdraw, msgValue);
}

/// Unwinds an admitted release whose lockbox withdraw did not complete. The lockbox echoes the
/// original withdraw, whose `extra.forwardPayload` still carries the pool's
/// `Jetton_ForwardPayloadWrap` (the `ReleaseContext` lives in the wrap's `context`).
fun recoverReleaseFromLockboxWithdraw(
    mutate st: Storage,
    withdraw: JettonLockBox_Withdraw,
    msgValue: coins,
) {
    assert(withdraw.extra != null, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed);
    val extra = withdraw.extra!.load();
    assert(extra.forwardPayload != null, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed);
    val wrap = lazy Jetton_ForwardPayloadWrap.fromCell(extra.forwardPayload!);
    assert(wrap.context != null, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed);
    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(wrap.context!);
    var pool = loadPool(st);
    pool.recoverReleaseOrMintFailure(context.forwardPayload.load(),
        LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed as int32, msgValue);
    st.poolData = pool.data.toCell();
}

/* === Pool loader === */

fun defaultBudget(_ctx: Storage?): TokenPool_Budget {
    return LockReleaseLockboxTokenPool_defaultBudget();
}

/// Releases are transferred out of the lockbox's wallet.
fun transferInitiator(ctx: Storage?): address? {
    assert(ctx != null && ctx!.lockbox != createAddressNone(), LockReleaseLockBoxTokenPool_Error.LockBoxNotConfigured);
    return ctx!.lockbox;
}

fun loadPool(st: Storage): TokenPool<Storage> {
    return TokenPool<Storage> {
        data: st.poolData.load(),
        context: st,
        hooks: TokenPool_Hooks<Storage> {
            ensureNotCursed: null,
            onLockOrBurn: null,
            validateLockOrBurn: null,
            preflightCheck: null,
            onLockOrBurnTransfer: null,
            onLockOrBurnTransferContinue,
            onReleaseOrMint: null,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
            onWithdrawFeeTokens: null,
            defaultBudget,
            transferInitiator,
        },
    };
}

/* === Getters === */

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseLockboxTokenPool_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return LockReleaseLockboxTokenPool_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(LockReleaseLockboxTokenPool_FACILITY_NAME.crc32(), local);
}

get fun token(): address {
    return Storage.load().poolData.load().token();
}

get fun tokenDecimals(): uint8 {
    return Storage.load().poolData.load().tokenDecimals;
}

get fun lockbox(): address {
    return Storage.load().lockbox;
}

get fun isSupportedChain(remoteChainSelector: uint64): bool {
    return Storage.load().poolData.load().remoteChainConfigs.get(remoteChainSelector).isFound;
}

get fun verifyNotCursed(subject: uint128): bool {
    return !Storage.load().poolData.load().localPolicy.load().cursePolicy.cursedSubjects.isCursed(subject);
}

get fun owner(): address {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().owner;
}

/// Gets the pending owner of the pool, if any (Ownable2Step).
get fun pendingOwner(): address? {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().get_pendingOwner();
}

/// Curse administrator for the pool-local policy, distinct from `owner()`.
get fun rmn_owner(): address {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.admin.get_owner();
}

get fun rmn_pendingOwner(): address? {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.admin.get_pendingOwner();
}

get fun rmn_hasRole(role: uint256, account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.hookTrait__AccessControl().hasRole(role, account);
}

get fun rmn_getRoleAdmin(role: uint256): uint256 {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.hookTrait__AccessControl().getRoleAdmin(role);
}

/// Effective curse authority. `rmn_hasRole` under-reports: the policy admin is
/// an implicit role bearer.
get fun rmn_canCurse(account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.canCurse(account);
}

get fun rmn_canUncurse(account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.canUncurse(account);
}

/// Returns the outbound and inbound rate limiter state for the given remote chain at the time of the call.
/// @param remoteChainSelector The remote chain selector.
/// @param fastFinality Whether to get the fast finality rate limiter state.
get fun getCurrentRateLimiterState(remoteChainSelector: uint64, fastFinality: bool): TokenPool_RateLimiterPair {
    val pool = loadPool(Storage.load());
    return pool.getCurrentRateLimiterState(remoteChainSelector, fastFinality);
}

/// Returns whether the given token address is supported by this pool.
get fun isSupportedToken(token: address): bool {
    val pool = loadPool(Storage.load());
    return pool.isSupportedToken(token);
}

/// Effective per-flow budget (instance config raised to the pool-type default).
get fun getBudget(): TokenPool_Budget {
    return loadPool(Storage.load()).budget();
}

/// Returns the pool's dynamic configuration (router, rateLimitAdmin, feeAdmin).
get fun getDynamicConfig(): TokenPool_DynamicConfig {
    val pool = loadPool(Storage.load());
    return pool.getDynamicConfig();
}

/// Returns the finality config as defined in the FinalityCodec library.
get fun getAllowedFinalityConfig(): uint32 {
    val ac = Storage.load().poolData.load().adminConfig.load();
    return ac.allowedFinalityConfig;
}

/// Returns the advanced pool hooks contract address, or null if not set.
get fun getAdvancedPoolHooks(): address? {
    val pool = loadPool(Storage.load());
    return pool.getAdvancedPoolHooks();
}

/// Returns the list of supported remote chain selectors.
get fun getSupportedChains(): lisp_list<uint64> {
    val pool = loadPool(Storage.load());
    return pool.getSupportedChains();
}

/// Checks if the given remote pool address is configured for the given remote chain.
get fun isRemotePool(remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    val pool = loadPool(Storage.load());
    return pool.isRemotePool(remoteChainSelector, remotePoolAddress);
}

/// Returns the remote token address for the given remote chain.
get fun getRemoteToken(remoteChainSelector: uint64): Cell<CrossChainAddress> {
    val pool = loadPool(Storage.load());
    return pool.getRemoteToken(remoteChainSelector);
}

/// Returns the list of remote pool addresses for the given remote chain.
get fun getRemotePools(remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>> {
    val pool = loadPool(Storage.load());
    return pool.getRemotePools(remoteChainSelector);
}

/// Returns the token transfer fee configuration for the given destination chain selector.
get fun getTokenTransferFeeConfig(destChainSelector: uint64): TokenPool_TokenTransferFeeConfig? {
    val pool = loadPool(Storage.load());
    return pool.getTokenTransferFeeConfig(destChainSelector);
}

/// Returns the fee parameters that will apply to a transfer to the given destination chain.
/// @param localToken The local token address.
/// @param destChainSelector The destination chain selector.
/// @param amount The transfer amount.
/// @param feeToken The fee token address.
/// @param requestedFinalityConfig The requested finality encoding.
/// @param tokenArgs Optional token-specific arguments.
get fun getFee(
    localToken: address,
    destChainSelector: uint64,
    amount: coins,
    feeToken: address,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
): (coins, uint32, uint32, uint16, bool) {
    val pool = loadPool(Storage.load());
    return pool.getFee(localToken, destChainSelector, amount, feeToken, requestedFinalityConfig, tokenArgs);
}

/// Calculates the fee amount based on the transfer details and finality config.
get fun getFeeAmount(
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): coins {
    val pool = loadPool(Storage.load());
    return pool.getFeeAmount(transfer, requestedFinalityConfig);
}

/// Returns the amount that would be passed to the CCV hooks for a `getCCVs` query,
/// given a transfer direction. Mirrors EVM's `getRequiredCCVs` amount logic: outbound is the
/// post-fee source-denominated amount; inbound is the source amount converted to local decimals
/// (via `sourcePoolData` in `extraData`).
/// @param remoteChainSelector The remote lane.
/// @param sourceDenominatedAmount The source-denominated amount.
/// @param requestedFinalityConfig Requested finality encoding.
/// @param direction `TokenPool_MessageDirection` (0 outbound, 1 inbound).
/// @param extraData Direction-specific payload (tokenArgs outbound, sourcePoolData inbound).
get fun getCCVAmount(
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: TokenPool_MessageDirection,
    extraData: cell?,
): coins {
    val pool = loadPool(Storage.load());
    return pool.getCCVAmount(remoteChainSelector, sourceDenominatedAmount, requestedFinalityConfig, direction, extraData);
}
