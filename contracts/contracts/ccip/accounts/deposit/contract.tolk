// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "types"
import "messages"
import "storage"
import "lib"

/// Deposit account accepts jetton transfers from a specific jetton wallet, escrows for
/// beneficiaries, and forwards unhandled messages to the `proxy` (e.g., TP, Router, etc.) as notifications.
///
/// @dev Only messages from the allowed jetton wallet are forwarded — all other unrecognized
///      messages are left unhandled and bounce.
///      
///      Specialized accounts can override the behaviour via the hooks model (see `lib.tolk`).
contract DepositAccount {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.DepositAccount"

    storage: DepositAccount_Data
    incomingMessages:
        | DepositAccount_InMessage
    outgoingMessages:
        | DepositAccount_OutMessage
}

/// Dispatches incoming messages with the default forward-on-notification hooks.
fun onInternalMessage(in: InMessage) {
    var account = DepositAccount<void>.load();
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

    // Unhandled (non-empty unrecognized) messages bounce to the sender.
    if (!handled) {
        throw 0xFFFF;
    }
}

/// Handles bounced outgoing messages (e.g. a withdrawn `AskToTransfer`); surfaces the failure to
/// the owner via the default withdraw-bounced handler.
fun onBouncedMessage(in: InMessageBounced) {
    var account = DepositAccount<void>.load();
    val handled = account.onBouncedMessage(in.senderAddress, in.bouncedBody);
    if (handled) {
        account.store();
    }
}

get fun typeAndVersion(): (slice, slice) {
    return (DepositAccount_CONTRACT_NAME, DepositAccount_CONTRACT_VERSION);
}

get fun getOwner(): address {
    val data = lazy DepositAccount_Data.load();
    return data.owner;
}

get fun getProxy(): address {
    val data = lazy DepositAccount_Data.load();
    return data.proxy;
}

get fun getAllowedJettonWallet(): address? {
    val data = lazy DepositAccount_Data.load();
    return data.allowedJettonWallet;
}

/// Returns the map of addresses that are allowed to withdraw jettons from this account's wallet.
get fun getBeneficiaries(): map<address, bool> {
    val data = lazy DepositAccount_Data.load();
    return data.beneficiaries;
}
