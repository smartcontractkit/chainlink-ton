// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../deposit/types"
import "../deposit/messages"
import "../deposit/storage"
import "../deposit/lib"
import "types"

/// Source-chain CCIP deposit account, derived from the generic `DepositAccount` component.
///
/// A user (owner) deposits jettons into this account's own jetton wallet, optionally carrying a
/// `Router_CCIPSend` in the jetton transfer's forward payload. Unlike the default DepositAccount
/// (which forwards the whole notification to its `proxy`), this account wires an `onForwardNotification`
/// hook: it validates that the notification carries enough gas, extracts the CCIPSend from the
/// forward payload, and sends it as a message directly to the Router (`proxy`). The jettons
/// themselves are **held** by the account (not transferred) and may later be withdrawn by a
/// beneficiary (the user or the Router).
///
/// Auth follows the DepositAccount model: `owner` (user) is a beneficiary; the Router is both the
/// `proxy` (receives the CCIPSend) and a beneficiary (can withdraw the deposited tokens into a
/// token pool to complete the cross-chain send).
contract OnRampAccount {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.OnRampAccount"

    storage: DepositAccount_Data
    incomingMessages:
        | DepositAccount_InMessage
    outgoingMessages:
        | DepositAccount_OutMessage
}

/// Builds an `OnRampAccount` `DepositAccount<T>` instance with the on-ramp hooks wired, so the same
/// dispatch can be reused from both `onInternalMessage` and `onBouncedMessage`. `context` is the
/// account's own data (`DepositAccount_Data`), so hooks can read the config (e.g. `proxy`) without
/// a separate parameter.
@inline
fun loadOnRampAccount(data: DepositAccount_Data): DepositAccount<void> {
    val hooks = DepositAccount_Hooks<void> {
        onInit: null,
        onWithdraw: null,
        onForwardNotification,
        onWithdrawBounced: null,
    };

    return DepositAccount<void> { data, extra: null, hooks };
}

/// Dispatches incoming messages with the on-ramp-specific hooks: a deposit notification from the
/// account's own jetton wallet triggers the `onForwardNotification` hook (validates gas, extracts
/// and forwards a CCIPSend to the Router) instead of the default "forward full notification"
/// behaviour.
fun onInternalMessage(in: InMessage) {
    val data = DepositAccount_Data.load();
    var account = loadOnRampAccount(data);
    val handled = account.onInternalMessage(
        in.senderAddress,
        in.valueCoins,
        in.body,
        DepositAccount_InMessageForward {
            senderAddress: in.senderAddress,
            valueCoins: in.valueCoins,
            valueExtra: in.valueExtra,
            originalForwardFee: in.originalForwardFee,
            createdLt: in.createdLt,
            createdAt: in.createdAt,
            body: in.body.toCell(),
        },
    );
    account.store();

    if (!handled) {
        assert(in.body.isEmpty()) throw 0xFFFF;
    }
}

/// Handles bounced outgoing messages (e.g. a withdrawn `AskToTransfer`); surfaces the failure to
/// the owner via the default withdraw-bounced handler.
fun onBouncedMessage(in: InMessageBounced) {
    val data = DepositAccount_Data.load();
    var account = loadOnRampAccount(data);
    val handled = account.onBouncedMessage(in.senderAddress, in.bouncedBody);
    if (handled) {
        account.store();
    }
}

/// On-ramp `onForwardNotification` hook: parses the `Router_CCIPSend` from a deposit notification's
/// forward payload and sends it to the Router (`proxy`). The deposited jettons stay in this
/// account's wallet for a later beneficiary withdrawal. Returns `true` when the message was
/// accepted (a valid jetton transfer notification, including a deposit-only one), `false` when the
/// body is not a recognized jetton notification — the caller then bounces non-empty unrecognized
/// bodies.
///
/// @dev The account is token-agnostic: it forwards any inbound non-control message here, and the
///      token-handling layer verifies the original message's sender via `forwarded.senderAddress`
///      before a withdraw. `context` is the account's own data (allows reading `proxy`). The Router
///      owns CCIPSend fee validation (`Router_Costs.CCIPSend`), so we forward the message as-is
///      with `NoBounce`: a Router rejection simply drops the CCIPSend and the deposited jettons stay
///      held by the account for a later beneficiary withdrawal.
fun onForwardNotification(
    context: DepositAccount_Context<void>,
    forwarded: DepositAccount_InMessageForward,
): bool {
    val data: DepositAccount_Data = context.data;

    // TODO: try to decode, return false
    // The envelope carries the original Jetton transfer notification body.
    val notification = lazy TransferNotificationForRecipient.fromSlice(forwarded.body.beginParse());

    // Extract the canonical forward payload (a ref or an inline slice).
    val ccipSendCell = loadForwardPayloadAsCell(notification.forwardPayload);
    if (ccipSendCell == null) {
        // Deposit-only: no CCIPSend to forward. Jettons stay in this account's wallet (held)
        // for a later beneficiary withdrawal (owner or Router).
        return true;
    }

    // Send the boxed Router_CCIPSend to the Router (proxy) as a message on its own. We do NOT touch
    // the jettons — they remain held by the account for a later withdraw. NoBounce: if the Router
    // rejects it, the CCIPSend is simply dropped and the jettons stay held for withdrawal (no bounce
    // needs to be handled here).
    val send = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: data.proxy,
        body: ccipSendCell!.beginParse(),
    });
    send.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return true;
}

get fun typeAndVersion(): (slice, slice) {
    return (OnRampAccount_CONTRACT_NAME, OnRampAccount_CONTRACT_VERSION);
}

get fun getOwner(): address {
    val data = lazy DepositAccount_Data.load();
    return data.owner;
}

get fun getProxy(): address {
    val data = lazy DepositAccount_Data.load();
    return data.proxy;
}
