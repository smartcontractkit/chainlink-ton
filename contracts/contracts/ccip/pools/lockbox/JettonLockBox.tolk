// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/common.tolk"

import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/messages"
import "../../../lib/access/access_control"
import "../../../lib/utils"

import "types"
import "messages"


contract JettonLockBox {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.JettonLockBox"

    storage: Storage
    incomingMessages: JettonLockBox_InMessage
    outgoingMessages: JettonLockBox_OutMessage
    // emittedEvents: JettonLockBox_Events // TODO:
}

// Contract metadata.
const CONTRACT_NAME = "link.chain.ton.ccip.JettonLockBox".literalSlice();
const CONTRACT_VERSION = "0.1.0".literalSlice();

/// Event topics.
const TOPIC_DEPOSIT = "JettonLockBox_Deposit".crc32();
const TOPIC_WITHDRAWAL = "JettonLockBox_Withdrawal".crc32();

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
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
            onDepositNotification(mutate st, in.senderAddress, msg);
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

/// Initialize the lockbox with jetton addresses and grant admin role to owner.
fun onInit(mutate st: Storage, sender: address, msg: JettonLockBox_Init) {
    // @dev: anyone can call init, but only once. The deployer should send init message
    // with stateInit (deployment). We check that the contract is not already initialized
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

    // Map from underlying trait storage to contract storage
    st.rbac = rbac.data;

    // We reserve some GRAM coins on the balance for rent
    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveToncoinsOnBalance(MIN_GRAM_TO_RESERVE, reserveMode);

    // Emit initialization event
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

/// Handle incoming jetton TransferNotificationForRecipient (deposit).
fun onDepositNotification(mutate st: Storage, sender: address, msg: TransferNotificationForRecipient) {
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);

    // Check authorization (transfer initiator must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, msg.transferInitiator!); // TODO: nullable? do/how we handle mint?

    // Validate amount is non-zero.
    assert(msg.jettonAmount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);

    // Validate sender is our jetton wallet.
    assert(st.walletAddress != null, JettonLockBox_Error.UnsupportedToken);
    assert(sender == st.walletAddress!, JettonLockBox_Error.UnsupportedToken);

    // TODO: check message value is enough to cover full flow, or error
    val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
    if (fwdps == null) {
        // TODO: do we return funds (best effort) or error?
        return;
    }
    val fwdp = JettonLockBox_Deposit.fromSlice(fwdps!);

    // TODO: assert fwdp and msg fields match (token, amount)

    // Emit deposit event.
    emit<JettonLockBox_Deposit>(TOPIC_DEPOSIT, fwdp);

    // TODO: needs to include more context/fwdPayload
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: msg.transferInitiator!,
        body: JettonLockBox_Deposited {
            queryId: fwdp.queryId,
            token: fwdp.token,
            remoteChainSelector: fwdp.remoteChainSelector,
            amount: fwdp.amount,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handle withdraw message from authorized caller.
fun onWithdraw(mutate st: Storage, sender: address, msg: JettonLockBox_Withdraw) {
    assert(st.isInitialized(), JettonLockBox_Error.ContractNotInitialized);

    // Check authorization (caller must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, sender);

    // Validate amount is non-zero.
    assert(msg.amount > 0, JettonLockBox_Error.TokenAmountCannotBeZero);

    // Validate recipient is not zero address.
    assert(msg.recipientWallet != createAddressNone(), JettonLockBox_Error.RecipientCannotBeZeroAddress);

    // Store withdraw initiator in forwardPayload (cell ref) for error reporting on bounce.
    // forwardPayload is of type RemainingBitsAndRefs (slice), which takes remaining inline bits
    // AND refs. We put the bounce data in a cell ref so only ~1 bit goes inline:
    // - inline: 1-bit flag (has_bounce_data)
    // - ref:    cell with marker + queryId + sender address (~355 bits)
    val bounceDataCell = beginCell()
        .storeUint(0x17c24007, 32) // JettonLockBox_WithdrawRequest marker
        .storeUint(msg.queryId, 64)
        .storeAddress(sender)
        .endCell();

    val fwdPayload = beginCell()
        .storeBool(true)  // flag: bounce data present
        .storeRef(bounceDataCell)  // goes to refs, not inline bits
        .endCell()
        .beginParse();

    // Validate wallet is initialized.
    assert(st.walletAddress != null, JettonLockBox_Error.UnsupportedToken);

    // Determine where to send ReturnExcessesBack (from extra cell or default to self).
    val sendExcessesToAddr = msg.extra != null
        ? msg.extra!.load().sendExcessesTo != null
            ? msg.extra!.load().sendExcessesTo!
            : contract.getAddress()
        : contract.getAddress();

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
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: fwdPayload,
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    // Emit withdrawal event.
    emit<JettonLockBox_Withdraw>(TOPIC_WITHDRAWAL, msg);
}

/// Handle bounced AskToTransfer (withdraw failed) - send error message to initiator.
/// The pool stores pending releases by queryId and restores context on JettonLockBox_WithdrawFailed.
fun onBouncedMessage(in: InMessageBounced) {
    val st = lazy Storage.load();

    // Parse the bounced message body
    val msg = lazy JettonLockBox_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());

    match (msg) {
        AskToTransfer => {
            // Extract withdraw initiator from forwardPayload cell ref.
            // The forwardPayload slice has: 1-bit flag + optional ref with bounce data.
            var fwdPayload = msg.forwardPayload;
            val hasBounceData = fwdPayload.loadUint(1) > 0;
            if (!hasBounceData) {
                return; // No initiator to notify
            }
            var bounceData = fwdPayload.loadRef().beginParse();
            val marker = bounceData.loadUint(32);
            val queryId = bounceData.loadUint(64);
            val withdrawInitiator = bounceData.loadAddress();

            // Send error message to withdraw initiator
            val errorMsg = createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: withdrawInitiator,
                body: JettonLockBox_WithdrawFailed {
                    queryId: queryId,
                    token: st.minterAddress,
                    amount: msg.jettonAmount,
                    recipientWallet: msg.transferRecipient,
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

/// Returns the contract type and version.
get fun typeAndVersion(): (slice, slice) {
    return (CONTRACT_NAME, CONTRACT_VERSION);
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
