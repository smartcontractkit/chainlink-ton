// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "@stdlib/common.tolk"
import "@stdlib/gas-payments"

import "../../../lib/utils"
import "../../../lib/access/access_control"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/forward_payload_wrap"
import "../../../lib/budget/gas"
import "../../../lib/budget/min_value"

import "../lib/token_pool/jetton_fees"

import "types"
import "messages"

/// Single-token escrow for CCIP token pools. Holds jettons that can only be withdrawn by authorized callers
/// (pool contracts with OPERATOR_ROLE). Incoming jetton transfers from an authorized initiator are treated as deposits.
/// @dev Acts as a shared vault — multiple pools can delegate to the same lockbox (e.g., migrating a TP)
/// instead of each holding their own jetton balance. Pools send/receive Deposit/Withdraw messages to move tokens in/out.
///
/// @warning `onDepositWithTransferNotification` will throw if `transferInitiator` is null (e.g., mint flows).
/// The pool must ensure the jetton transfer is initiated by an address, not a mint operation.
contract JettonLockBox {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.JettonLockBox"

    storage: Storage
    incomingMessages: JettonLockBox_InMessage
    outgoingMessages: JettonLockBox_OutMessage
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

/// Deposits tokens into this contract. This eases the process of migrating tokens
/// from a legacy token pool to a new one, since only the allowedCaller needs to be changed. Without it, the tokens
/// would need to be manually withdrawn and re-deposited into the new token pool from a legacy pool, which is a
/// time-consuming and error-prone process.
fun onInternalMessage(in: InMessage) {
    var st = Storage.load();
    val msg = lazy JettonLockBox_InMessage.fromSlice(in.body);

    match (msg) {
        TransferNotificationForRecipient => {
            onDepositWithTransferNotification(mutate st, in.senderAddress, in.valueCoins, msg);
        }
        JettonLockBox_Withdraw => {
            onWithdraw(mutate st, in.senderAddress, in.valueCoins, msg);
        }
        JettonLockBox_Init => {
            onInit(mutate st, in.senderAddress, in.valueCoins, msg);
        }
        else => {
            var rbac = hookTrait__AccessControl(st);

            val msgHandled = 0
                || rbac.onInternalMessage(in.senderAddress, in.valueCoins, in.body);

            if (msgHandled) {
                // Map from underlying trait storage to contract storage
                st.rbac = rbac.data;
                return st.store();
            }

            // Accept empty messages (top-up), reject everything else.
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }

    st.store();
}

// --- Handlers ---

/// One-time initialization: sets jetton addresses and grants admin role.
/// @dev The deployer binds itself as the authorized initializer at construction (stateInit).
fun onInit(mutate st: Storage, sender: address, msgValue: coins, msg: JettonLockBox_Init) {
    assert(!st.isInitialized(), JettonLockBox_Error.ContractAlreadyInitialized);

    // Only the initializer bound at construction (stateInit) may initialize.
    assert(sender == st.initializer, JettonLockBox_Error.UnauthorizedInitializer);

    // Validate addresses are not zero
    assert(!isZeroAddress(msg.minterAddress), JettonLockBox_Error.UnsupportedToken);
    assert(!isZeroAddress(msg.walletAddress), JettonLockBox_Error.UnsupportedToken);

    // Set storage addresses
    st.minterAddress = msg.minterAddress;
    st.walletAddress = msg.walletAddress;

    // minval:check-admission gate=A/static JettonLockBox_Init
    // Require enough value to cover the rent reserve plus the init replies
    assert(contract.getOriginalBalance() >= MIN_GRAM_TO_RESERVE + MIN_GRAM_TO_INIT, JettonLockBox_Error.NotEnoughValue);

    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveGramsOnBalance(MIN_GRAM_TO_RESERVE, reserveMode);

    // Initialize AccessControl roles.
    // @dev Pass `returnExcess = false` so each reply is sent with a fixed gas budget
    // (SEND_MODE_PAY_FEES_SEPARATELY) instead of carrying all remaining inbound value.
    val returnExcess = false;
    var rbac = hookTrait__AccessControl(st);
    rbac._setRoleAdmin(msg.queryId, sender, DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE, returnExcess);
    rbac._setRoleAdmin(msg.queryId, sender, OPERATOR_ROLE, DEFAULT_ADMIN_ROLE, returnExcess);

    val adminAddress = msg.admin != null ? msg.admin! : sender;
    rbac._grantRole(msg.queryId, sender, DEFAULT_ADMIN_ROLE, adminAddress, returnExcess);

    // TODO: add operators on init
    // var oo = operators.iter();
    // while (!oo.empty()) {
    //     rbac._grantRole(queryId, sender, OPERATOR_ROLE, oo.next(), returnExcess);
    // }

    st.rbac = rbac.data;

    // Notify sender that initialization is complete, returning the excess value
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: JettonLockBox_Initialized {
            queryId: msg.queryId,
            minterAddress: msg.minterAddress,
            walletAddress: msg.walletAddress,
            admin: adminAddress,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/// Handles jetton transfer notifications — treats them as deposits.
/// Only accepts notifications from the lockbox's own jetton wallet with an authorized transfer initiator.
/// 
/// @dev If the forward payload is missing, the deposit cannot be identified: no `JettonLockBox_Deposited`
///      will be issued (so the pool would never finalize and its rate limit stays consumed) and the tokens
///      would otherwise be permanently parked in this lockbox. Return them best-effort to the transfer
///      initiator instead of silently dropping them.
fun onDepositWithTransferNotification(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    msg: TransferNotificationForRecipient,
) {
    // Assert basic conditions before acting on it.
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);
    assert(msg.jettonAmount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);
    assert(st.walletAddress != null && sender == st.walletAddress!, JettonLockBox_Error.UnsupportedToken);

    // TODO: a minter can impersonate any transferInitiator, meaning inject any fwdPayload

    // A null transferInitiator means this is not an operator-initiated deposit (e.g. a bare mint into the
    // lockbox wallet). It cannot be attributed or returned so we accept and error.
    assert(msg.transferInitiator != null, AccessControl_Error.UnauthorizedAccount);

    // Decode outside the validation try so its catch retains the deposit's correlation context.
    var deposit: JettonLockBox_Deposit? = null;
    try {
        val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
        if (fwdps != null) {
            deposit = JettonLockBox_Deposit.fromSlice(fwdps!);
        }
    } catch {}

    try {
        // Custody already arrived: validation and value failures use the existing custody-return path.
        assert(deposit != null, JettonLockBox_Error.MissingOrMalformedForwardPayload);
        val rbac = hookTrait__AccessControl(st);
        rbac.requireRole(OPERATOR_ROLE, msg.transferInitiator!);

        assert(deposit!.token == st.minterAddress, JettonLockBox_Error.UnsupportedToken);
        assert(deposit!.amount == msg.jettonAmount, JettonLockBox_Error.MissingOrMalformedForwardPayload);

        // minval:non-reject gate=none JettonLockBox.TransferNotificationForRecipient
        // Custody has arrived; finalize optimistically without rejecting.
        // The operator funds the confirmation when it sends the deposit.

        // The log and transfer are separate actions. Protect the pre-message balance, then carry
        // only the unreserved remainder after paying for the log and this transaction.
        reserveBalanceBeforeInMessage(msgValue);
        emit<JettonLockBox_Deposit>(TOPIC_DEPOSIT, deposit!);

        // Reply to the operator (pool) so it knows the deposit is confirmed.
        val reply = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: msg.transferInitiator!,
            body: JettonLockBox_Deposited {
                queryId: deposit!.queryId,
                token: deposit!.token,
                depositor: msg.transferInitiator,
                amount: deposit!.amount,
                context: deposit!.context,
            },
        });
        reply.send(SEND_MODE_CARRY_ALL_BALANCE);
    } catch (errorCode) {
        onDepositReturn(st, msgValue, msg, deposit, errorCode);
    }
}

/// Handles the return of a deposit in case of failure.
fun onDepositReturn(
    st: Storage,
    msgValue: coins,
    msg: TransferNotificationForRecipient,
    deposit: JettonLockBox_Deposit?,
    errorCode: int32,
) {
    // The failure is optional, only if deposit information is available, and it's
    // non-configurable by design, always sent back to the initiator of the deposit.
    val failureValue = deposit != null ? deposit!.failureValue : 0 as coins;
    var failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: failureValue,
        dest: msg.transferInitiator!,
        body: JettonLockBox_DepositFailed {
            queryId: deposit != null ? deposit!.queryId : msg.queryId,
            token: st.minterAddress,
            depositor: msg.transferInitiator!,
            amount: msg.jettonAmount,
            context: deposit != null ? deposit!.toCell() : null,
            errorCode,
        }
    });

    // Best-effort return to the account named in the deposit (falls back to the depositor).
    val returnTo = deposit != null && deposit!.returnAddress != null
        ? deposit!.returnAddress!
        : msg.transferInitiator!;
    val forwardPayload = deposit != null
        ? msg.forwardPayload
        : beginCell()
            .storeMaybeRef(null)
            .endCell()
            .beginParse();
    // A failed return uses a short bounce; the lockbox accepts the returned TON and never
    // enters the rich-bounce withdraw handler.
    var transfer = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: st.walletAddress!, // sender
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.jettonAmount,
            transferRecipient: returnTo,
            sendExcessesTo: returnTo,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload,
        }
    });

    // Funds are always returned best-effort, but the failure report is optional and funded by the caller's
    // failureValue. If not enough funds are provided, the failure message will not be sent.
    val failureCost = failureValue + failure.estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);
    if (failureValue > 0 && msgValue > failureCost) {
        reserveBalanceBeforeInMessage(msgValue);
        failure.send(SEND_MODE_PAY_FEES_SEPARATELY);
        transfer.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);

        return;
    }

    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
}

/// Sends jettons from the lockbox to a recipient wallet.
/// @dev Bounces to `onBouncedMessage` if the transfer fails, which notifies the caller with `WithdrawFailed`.
/// @dev The caller's address and the original withdraw request are tagged onto the transfer's
/// `forwardPayload` via `Jetton_ForwardPayloadWrap`, so the bounce handler can notify the caller with context.
fun onWithdraw(mutate st: Storage, sender: address, msgValue: coins, msg: JettonLockBox_Withdraw) {
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);

    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, sender);

    assert(msg.amount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);
    assert(msg.token == st.minterAddress, JettonLockBox_Error.UnsupportedToken);
    assert(!isZeroAddress(msg.recipient), JettonLockBox_Error.RecipientCannotBeZeroAddress);
    assert(st.walletAddress != null, JettonLockBox_Error.UnsupportedToken);

    // The log and transfer are separate actions. Protect the pre-message balance, then carry
    // only the unreserved remainder after paying for the log and this transaction.
    reserveBalanceBeforeInMessage(msgValue);
    emit<JettonLockBox_Withdraw>(TOPIC_WITHDRAWAL, msg);

    // Determine where to send ReturnExcessesBack (from extra cell or default to self).
    val sendExcessesTo = msg.extra != null
        ? msg.extra!.load().sendExcessesTo != null
            ? msg.extra!.load().sendExcessesTo!
            : contract.getAddress()
        : contract.getAddress();

    // Get forwardTonAmount from extra (defaults to 0 for backward compatibility).
    val forwardTonAmount = msg.extra != null ? msg.extra!.load().forwardTonAmount : 0 as coins;

    // The caller (pool) tags its payload with a `Jetton_ForwardPayloadWrap` carrying its own
    // failure context. Unwrap one layer so the delivered payload is the caller's original
    // `forwardPayload`, then re-tag it with our context (the full withdraw) for the bounce path.
    // The caller's payload stays reachable via the echoed withdraw's `extra.forwardPayload`.
    val callerPayload = msg.extra != null ? msg.extra!.load().forwardPayload : null;
    val delivered = Jetton_ForwardPayloadWrap.unwrapForwardPayload(callerPayload);

    val wrap = Jetton_ForwardPayloadWrap {
        initiator: sender,
        context: msg.toCell(),
        forwardPayload: delivered,
    };

    // Send AskToTransfer to our jetton wallet (rich bounce on failure).
    val transferOpts = CreateMessageOptions<AskToTransfer> {
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.walletAddress!,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipient,
            sendExcessesTo,
            customPayload: null,
            forwardTonAmount,
            forwardPayload: wrap.asForwardPayload(),
        },
    };

    val sendMode = SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL;
    val fwdFee = createMessage(transferOpts).estimateFeeWithoutSending(sendMode);

    // minval:check-bounce gate=A/dynamic JettonLockBox_Withdraw
    // Before custody moves; check budget for transfer/forward and withdrawal relay/failure
    // This check is an estimate and an early guard; the actual jetton wallet checks its own
    // transfer cost and bounces back if not enough value is provided.
    val w = contract.getAddress().getWorkchain();
    val minValue = JettonFees.Reference.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(w, JettonLockBox_WITHDRAW_GAS_UNITS);
    assertMinValue(msgValue, minValue, JettonLockBox_Error.NotEnoughValue);

    val transfer = createMessage(transferOpts);
    transfer.send(sendMode);
}

/// Handles bounced jetton transfers — notifies the original caller that the withdrawal failed.
/// @dev The bounce handler recovers the caller and the original withdraw request from the
/// `Jetton_ForwardPayloadWrap` tagged onto the `AskToTransfer` in `onWithdraw`.
fun onBouncedMessage(in: InMessageBounced) {
    val st = lazy Storage.load();

    // A failed best-effort return: accept its value in the lockbox. The truncated body is
    // intentionally not parsed; jettons remain in the lockbox wallet.
    if (isShortAskToTransferBounce(in.bouncedBody)) {
        return;
    }

    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy JettonLockBox_BouncedMessage.fromCell(rich.originalBody);

    match (msg) {
        AskToTransfer => {
            val wrap = parseLockBoxWithdrawWrap(msg.forwardPayload);
            assert(wrap != null, JettonLockBox_Error.MissingOrMalformedForwardPayload);

            // Send error message to withdraw initiator
            val errorMsg = createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: wrap!.initiator,
                body: JettonLockBox_WithdrawFailed {
                    queryId: msg.queryId,
                    token: st.minterAddress,
                    context: wrap!.context! as Cell<JettonLockBox_Withdraw>,
                },
            });
            errorMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
    }
}

/// Parses the `Jetton_ForwardPayloadWrap` from a (possibly bounced) withdraw `AskToTransfer`,
/// or `null` if the ask isn't a lockbox withdrawal.
@inline
fun parseLockBoxWithdrawWrap(forwardPayload: ForwardPayloadRemainder): Jetton_ForwardPayloadWrap? {
    val wrap = Jetton_ForwardPayloadWrap.from(forwardPayload);
    if (wrap == null || wrap!.context == null) {
        return null;
    }

    val ctx = lazy JettonLockBox_Withdraw.fromCell(wrap!.context!);
    match (ctx) {
        JettonLockBox_Withdraw => { return wrap; }
        else => { return null; }
    }
}

// --- AccessControl hook ---

fun hookTrait__AccessControl(st: Storage): AccessControl<null?> {
    return AccessControl<null?> { data: st.rbac, context: null, hooks: null };
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return (JettonLockBox_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return JettonLockBox_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(JettonLockBox_FACILITY_NAME.crc32(), local);
}

/// Returns the jetton minter address (token) held by this lockbox.
get fun token(): address {
    val st = lazy Storage.load();
    return st.minterAddress;
}

/// Returns the jetton wallet address used by this lockbox.
get fun wallet(): address? {
    val st = lazy Storage.load();
    return st.walletAddress;
}

/// Returns whether the lockbox supports the given token.
get fun isSupportedToken(token: address): bool {
    val st = lazy Storage.load();
    return st.minterAddress == token;
}

// --- AccessControl getters ---

get fun hasRole(role: uint256, account: address): bool {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.hasRole(role, account);
}

get fun getRoleAdmin(role: uint256): uint256 {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleAdmin(role);
}

get fun getRoleMemberCount(role: uint256): int {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleMemberCount(role);
}

get fun getRoleMember(role: uint256, index: uint32): address? {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleMember(role, index);
}

get fun getRoleMemberFirst(role: uint256): address? {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleMemberFirst(role);
}

get fun getRoleMemberNext(role: uint256, pivot: address): address? {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleMemberNext(role, pivot);
}

get fun getRoleMembers(role: uint256): map<address, bool> {
    val st = lazy Storage.load();
    val rbac = hookTrait__AccessControl(st);
    return rbac.getRoleMembers(role);
}
