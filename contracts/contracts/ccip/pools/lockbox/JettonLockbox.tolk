// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/common.tolk"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/messages"
import "../../../lib/access/access_control"
import "../../../lib/utils"

import "types"
import "messages"

// Contract metadata.
const CONTRACT_NAME = "link.chain.ton.ccip.JettonLockbox".literalSlice();
const CONTRACT_VERSION = "0.1.0".literalSlice();

/// Event topics.
const TOPIC_DEPOSIT = stringCrc32("JettonLockbox_Deposit");
const TOPIC_WITHDRAWAL = stringCrc32("JettonLockbox_Withdrawal");

// --- Contract entry point ---

/// Deposits tokens into this contract. This eases the process of migrating tokens
/// from a legacy token pool to a new one, since only the allowedCaller needs to be changed. Without it, the tokens
/// would need to be manually withdrawn and re-deposited into the new token pool from a legacy pool, which is a
/// time-consuming and error-prone process.

// TODO: add Init where we add access control setup (like rbac_timelock.tolk)
// rbac._setRoleAdmin(queryId, sender, ADMIN_ROLE, ADMIN_ROLE);
// rbac._setRoleAdmin(queryId, sender, OPERATOR_ROLE, ADMIN_ROLE);
// rbac._grantRole(queryId, sender, ADMIN_ROLE, admin);
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

// --- Deposit handler ---

/// Handle incoming jetton TransferNotificationForRecipient (deposit).
fun onDepositNotification(mutate st: Storage, sender: address, msg: TransferNotificationForRecipient) {
    // Check authorization (transfer initiator must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, msg.transferInitiator!); // TODO: nullable? do/how we handle mint?

    // Validate amount is non-zero.
    assert(msg.jettonAmount > 0, JettonLockbox_Error.TokenAmountCannotBeZero);

    // Validate sender is our jetton wallet.
    assert(sender == st.walletAddress, JettonLockbox_Error.UnsupportedToken);

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

// --- Withdraw handler ---

/// Handle withdraw message from authorized caller.
fun onWithdraw(mutate st: Storage, sender: address, msg: JettonLockbox_Withdraw) {
    // Check authorization (caller must have OPERATOR_ROLE).
    val rbac = hookTrait__AccessControl(st);
    rbac.requireRole(OPERATOR_ROLE, sender);

    // Validate amount is non-zero.
    assert(msg.amount > 0, JettonLockbox_Error.TokenAmountCannotBeZero);

    // Validate recipient is not zero address.
    assert(msg.recipientWallet != createAddressNone(), JettonLockbox_Error.RecipientCannotBeZeroAddress);

    // Send AskToTransfer to our jetton wallet (rich bounce on failure).
    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.walletAddress,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipientWallet,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            // TODO: how do we handle fwdp amount?
            forwardTonAmount: 0,
             // TODO: fwd add payload `JettonLockbox_Withdrawn`
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    // Emit withdrawal event.
    emit<JettonLockbox_Withdraw>(TOPIC_WITHDRAWAL, msg);
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
get fun wallet(): address {
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
