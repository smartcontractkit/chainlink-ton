// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/common.tolk"

import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/messages"
import "../../../lib/access/access_control"
import "../../../lib/utils"

import "types"
import "messages"


contract JettonLockbox {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.JettonLockbox"

    storage: Storage
    incomingMessages: JettonLockbox_InMessage // TODO: all incoming messages should be registered
    outgoingMessages: JettonLockbox_OutMessage
    // emittedEvents: JettonLockbox_Events // TODO:
}

// Contract metadata.
const CONTRACT_NAME = "link.chain.ton.ccip.JettonLockbox".literalSlice();
const CONTRACT_VERSION = "0.1.0".literalSlice();

/// Event topics.
const TOPIC_DEPOSIT = stringCrc32("JettonLockbox_Deposit");
const TOPIC_WITHDRAWAL = stringCrc32("JettonLockbox_Withdrawal");

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
const MIN_GRAM_TO_RESERVE: int = ton("0.05");

// --- Contract entry point ---

/// Deposits tokens into this contract. This eases the process of migrating tokens
/// from a legacy token pool to a new one, since only the allowedCaller needs to be changed. Without it, the tokens
/// would need to be manually withdrawn and re-deposited into the new token pool from a legacy pool, which is a
/// time-consuming and error-prone process.

fun onInternalMessage(in: InMessage) {
    var st = Storage.load();

    // Parse as JettonLockbox_InMessage.
    val msg = lazy JettonLockbox_InMessage.fromSlice(in.body);

    match (msg) {
        TransferNotificationForRecipient => {
            onDepositNotification(mutate st, in.senderAddress, msg);
        }
        JettonLockbox_Withdraw => {
            onWithdraw(mutate st, in.senderAddress, msg);
        }
        JettonLockbox_Init => {
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
fun onInit(mutate st: Storage, sender: address, msg: JettonLockbox_Init) {
    // @dev: anyone can call init, but only once. The deployer should send init message
    // with stateInit (deployment). We check that the contract is not already initialized
    assert(!st.isInitialized(), JettonLockbox_Error.ContractAlreadyInitialized);

    // Validate addresses are not zero
    assert(msg.minterAddress != createAddressNone(), JettonLockbox_Error.UnsupportedToken);
    assert(msg.walletAddress != createAddressNone(), JettonLockbox_Error.UnsupportedToken);

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

    // // TODO: why is this causing 37 'Not Enough Toncoin'
    // // We reserve some GRAM coins on the balance for rent
    // val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    // reserveToncoinsOnBalance(MIN_GRAM_TO_RESERVE, reserveMode);

    // // Emit initialization event
    // val reply = createMessage({
    //     bounce: BounceMode.NoBounce,
    //     value: 0,
    //     dest: sender,
    //     body: JettonLockbox_Initialized {
    //         queryId: msg.queryId,
    //         minterAddress: msg.minterAddress,
    //         walletAddress: msg.walletAddress,
    //         admin: adminAddress,
    //     },
    // });
    // reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handle incoming jetton TransferNotificationForRecipient (deposit).
fun onDepositNotification(mutate st: Storage, sender: address, msg: TransferNotificationForRecipient) {
    assert(st.isInitialized(), JettonLockbox_Error.ContractNotInitialized);

    // Check authorization (transfer initiator must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, msg.transferInitiator!); // TODO: nullable? do/how we handle mint?

    // Validate amount is non-zero.
    assert(msg.jettonAmount > 0, JettonLockbox_Error.TokenAmountCannotBeZero);

    // Validate sender is our jetton wallet.
    assert(st.walletAddress != null, JettonLockbox_Error.UnsupportedToken);
    assert(sender == st.walletAddress!, JettonLockbox_Error.UnsupportedToken);

    // TODO: check message value is enough to cover full flow, or error
    val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
    if (fwdps == null) {
        // TODO: do we return funds (best effort) or error?
        return;
    }
    val fwdp = JettonLockbox_Deposit.fromSlice(fwdps!);

    // TODO: assert fwdp and msg fields match (token, amount)

    // Emit deposit event.
    emit<JettonLockbox_Deposit>(TOPIC_DEPOSIT, fwdp);

    // TODO: needs to include more context/fwdPayload
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: msg.transferInitiator!,
        body: JettonLockbox_Deposited {
            queryId: fwdp.queryId,
            token: fwdp.token,
            remoteChainSelector: fwdp.remoteChainSelector,
            amount: fwdp.amount,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handle withdraw message from authorized caller.
fun onWithdraw(mutate st: Storage, sender: address, msg: JettonLockbox_Withdraw) {
    assert(st.isInitialized(), JettonLockbox_Error.ContractNotInitialized);

    // Check authorization (caller must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, sender);

    // Validate amount is non-zero.
    assert(msg.amount > 0, JettonLockbox_Error.TokenAmountCannotBeZero);

    // Validate recipient is not zero address.
    assert(msg.recipientWallet != createAddressNone(), JettonLockbox_Error.RecipientCannotBeZeroAddress);

    // Store withdraw initiator in forward payload for error reporting on bounce.
    val fwdPayload = beginCell()
        .storeBool(true)
        .storeUint(0x17c24007, 32) // JettonLockbox_WithdrawRequest marker
        .storeUint(msg.queryId, 64)
        .storeAddress(sender)
        .endCell()
        .beginParse();

    // Validate wallet is initialized.
    assert(st.walletAddress != null, JettonLockbox_Error.UnsupportedToken);

    // Send AskToTransfer to our jetton wallet (rich bounce on failure).
    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.walletAddress!,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipientWallet,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: fwdPayload,
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    // Emit withdrawal event.
    emit<JettonLockbox_Withdraw>(TOPIC_WITHDRAWAL, msg);
}

/// Handle bounced AskToTransfer (withdraw failed) - send error message to initiator.
fun onBouncedMessage(in: InMessageBounced) {
    val st = lazy Storage.load();

    // Parse the bounced message body
    val msg = lazy JettonLockbox_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());

    match (msg) {
        AskToTransfer => {
            // Extract withdraw initiator from forward payload
            var fwdPayloadCell = msg.forwardPayload;
            val hasPayload = fwdPayloadCell.loadUint(1) > 0;
            if (!hasPayload) {
                return; // No initiator to notify
            }
            val marker = fwdPayloadCell.loadUint(32);
            val queryId = fwdPayloadCell.loadUint(64);
            val withdrawInitiator = fwdPayloadCell.loadAddress();

            // Send error message to withdraw initiator
            val errorMsg = createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: withdrawInitiator,
                body: JettonLockbox_WithdrawFailed {
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
