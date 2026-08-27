// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/common.tolk"

import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/messages"
import "../../../lib/access/access_control"
import "../../../lib/utils"

import "../lib/token_pool/entrypoint"

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
    description: "link.chain.ton.ccip.JettonLockBox"

    storage: Storage
    incomingMessages: JettonLockBox_InMessage
    outgoingMessages: JettonLockBox_OutMessage
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

/// Storage rent reserve to keep the contract alive.
const MIN_GRAM_TO_RESERVE: int = ton("0.05");

// --- Contract entry point ---

/// Deposits tokens into this contract. This eases the process of migrating tokens
/// from a legacy token pool to a new one, since only the allowedCaller needs to be changed. Without it, the tokens
/// would need to be manually withdrawn and re-deposited into the new token pool from a legacy pool, which is a
/// time-consuming and error-prone process.
fun onInternalMessage(in: InMessage) {
    var st = Storage.load();
    val msg = lazy JettonLockBox_InMessage.fromSlice(in.body);

    match (msg) {
        TransferNotificationForRecipient => {
            // TODO: we should try/catch and best effort return funds if deposit fails (e.g., forwardPayload missing)
            onDepositWithTransferNotification(mutate st, in.senderAddress, msg);
        }
        JettonLockBox_Withdraw => {
            onWithdraw(mutate st, in.senderAddress, msg);
        }
        JettonLockBox_Init => {
            onInit(mutate st, in.senderAddress, msg);
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
/// @dev Anyone can call this (only the first call succeeds). The pool is expected to send the Init message
/// during deployment (with stateInit), so in practice only the deployer can reach the uninitialized contract.
/// TODO: fixme
/// @bug There is no ownership check — if the deployment address is guessable, anyone can frontrun.
fun onInit(mutate st: Storage, sender: address, msg: JettonLockBox_Init) {
    assert(!st.isInitialized(), JettonLockBox_Error.ContractAlreadyInitialized);

    // Validate addresses are not zero
    assert(msg.minterAddress != createAddressNone(), JettonLockBox_Error.UnsupportedToken);
    assert(msg.walletAddress != createAddressNone(), JettonLockBox_Error.UnsupportedToken);

    // Set storage addresses
    st.minterAddress = msg.minterAddress;
    st.walletAddress = msg.walletAddress;

    // Initialize AccessControl roles
    var rbac = hookTrait__AccessControl(st);
    rbac._setRoleAdmin(msg.queryId, sender, DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    rbac._setRoleAdmin(msg.queryId, sender, OPERATOR_ROLE, DEFAULT_ADMIN_ROLE);

    val adminAddress = msg.admin != null ? msg.admin! : sender;
    rbac._grantRole(msg.queryId, sender, DEFAULT_ADMIN_ROLE, adminAddress);

    // TODO: add operators on init
    // var oo = operators.iter();
    // while (!oo.empty()) {
    //     rbac._grantRole(queryId, sender, OPERATOR_ROLE, oo.next());
    // }

    st.rbac = rbac.data;

    // We reserve some GRAM coins on the balance for rent
    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveToncoinsOnBalance(MIN_GRAM_TO_RESERVE, reserveMode);

    // Notify sender that initialization is complete.
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
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handles jetton transfer notifications — treats them as deposits.
/// Only accepts notifications from the lockbox's own jetton wallet with an authorized transfer initiator.
/// 
/// @dev If the forward payload is missing, the deposit cannot be identified: no `JettonLockBox_Deposited`
///      will be issued (so the pool would never finalize and its rate limit stays consumed) and the tokens
///      would otherwise be permanently parked in this lockbox. Return them best-effort to the transfer
///      initiator instead of silently dropping them.
fun onDepositWithTransferNotification(mutate st: Storage, sender: address, msg: TransferNotificationForRecipient) {
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);

    // TODO: fixme
    // @bug transferInitiator is nullable — mint operations have null initiator, causing a crash here.
    assert(msg.transferInitiator != null, JettonLockBox_Error.ContractNotInitialized);

    assert(msg.jettonAmount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);
    assert(st.walletAddress != null && sender == st.walletAddress!, JettonLockBox_Error.UnsupportedToken);

    // TODO: check message value is enough to cover full flow, or error
    // If the forward payload is missing OR malformed, no pool can be notified and no
    // `JettonLockBox_Deposited` will ever be issued — the jettons would be permanently parked here.
    // Return custody to the token sender (best-effort) instead of silently dropping them (D1).
    val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
    if (fwdps == null) {
        TokenPool<void>.returnTransfer(sender, msg);
        // TODO: should we notify deposit failed?
        return;
    }

    // TODO: assert fwdp and msg fields match (token, amount)
    try {
        val rbac = hookTrait__AccessControl(st);
        rbac.requireRole(OPERATOR_ROLE, msg.transferInitiator!);

        val fwdp = JettonLockBox_Deposit.fromSlice(fwdps!);
        emit<JettonLockBox_Deposit>(TOPIC_DEPOSIT, fwdp);

        // Reply to the pool so it knows the deposit is confirmed.
        val reply = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: msg.transferInitiator!,
            body: JettonLockBox_Deposited {
                queryId: fwdp.queryId,
                token: fwdp.token,
                remoteChainSelector: fwdp.remoteChainSelector,
                amount: fwdp.amount,
                context: fwdp.context,
            },
        });
        reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    } catch (errorCode) {
        TokenPool<void>.returnTransfer(sender, msg);
        // TODO: should we notify deposit failed?
    }
}

/// Sends jettons from the lockbox to a recipient wallet.
/// @dev Bounces to `onBouncedMessage` if the transfer fails, which notifies the caller with `WithdrawFailed`.
/// The `customPayload` embeds the caller's address so the bounce handler knows who to notify.
fun onWithdraw(mutate st: Storage, sender: address, msg: JettonLockBox_Withdraw) {
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);

    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, sender);

    assert(msg.amount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);
    assert(msg.recipientWallet != createAddressNone(), JettonLockBox_Error.RecipientCannotBeZeroAddress);
    assert(st.walletAddress != null, JettonLockBox_Error.UnsupportedToken);

    // Determine where to send ReturnExcessesBack (from extra cell or default to self).
    val sendExcessesToAddr = msg.extra != null
        ? msg.extra!.load().sendExcessesTo != null
            ? msg.extra!.load().sendExcessesTo!
            : contract.getAddress()
        : contract.getAddress();

    // Get forwardTonAmount from extra (defaults to 0 for backward compatibility).
    val forwardTonAmount = msg.extra != null ? msg.extra!.load().forwardTonAmount : 0 as coins;

    // Use forwardPayload from extra if provided (e.g., pool release context).
    val forwardPayload = msg.extra != null && msg.extra!.load().forwardPayload != null
        ? msg.extra!.load().forwardPayload
        : null;

    // Send AskToTransfer to our jetton wallet (rich bounce on failure).
    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.walletAddress!,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipientWallet,
            sendExcessesTo: sendExcessesToAddr,
            customPayload: beginCell()
                .storeAddress(sender) // caller address for bounce notification
                .endCell(),
            forwardTonAmount: forwardTonAmount,
            forwardPayload: beginCell()
                .storeMaybeRef(forwardPayload)
                .endCell()
                .beginParse(),
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    emit<JettonLockBox_Withdraw>(TOPIC_WITHDRAWAL, msg);
}

/// Handles bounced jetton transfers — notifies the original caller that the withdrawal failed.
/// @dev The bounce handler extracts the caller address from `customPayload` (set during `onWithdraw`).
fun onBouncedMessage(in: InMessageBounced) {
    val st = lazy Storage.load();

    // `onWithdraw` sends `AskToTransfer` with `BounceMode.RichBounce`, so the bounced body is a
    // `RichBounceBody` envelope (`0xFFFFFFFE`…), NOT the raw body. Parse the envelope and extract
    // the original `AskToTransfer` from it.
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy JettonLockBox_BouncedMessage.fromCell(rich.originalBody);

    match (msg) {
        AskToTransfer => {
            // We always set the customPayload to the withdraw initiator address
            val withdrawInitiator = msg.customPayload!.beginParse().loadAddress();
            val contextCell = loadForwardPayloadAsCell(msg.forwardPayload);

            // Send error message to withdraw initiator
            val errorMsg = createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: withdrawInitiator,
                body: JettonLockBox_WithdrawFailed {
                    queryId: msg.queryId,
                    token: st.minterAddress,
                    // TODO: should we put the whole AskToTransfer here
                    amount: msg.jettonAmount,
                    recipientWallet: msg.transferRecipient,
                    context: contextCell,
                },
            });
            errorMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
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
