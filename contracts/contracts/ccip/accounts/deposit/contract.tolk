// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "../../../lib/utils"

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
    description: "link.chain.ton.ccip.account.DepositAccount"

    storage: DepositAccount_Data
    incomingMessages:
        | DepositAccount_InMessage
    outgoingMessages:
        | DepositAccount_OutMessage
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

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

    if (!handled) {
        assert(in.body.isEmpty()) throw 0xFFFF;
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
    return (DepositAccount_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return DepositAccount_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(DepositAccount_FACILITY_NAME.crc32(), local);
}

get fun getOwner(): address {
    val data = lazy DepositAccount_Data.load();
    return data.owner;
}

get fun getProxy(): address {
    val data = lazy DepositAccount_Data.load();
    return data.proxy;
}

/// Returns the set of addresses that are allowed to withdraw jettons from this account's wallet.
get fun getBeneficiaries(): map<address, ()> {
    val data = lazy DepositAccount_Data.load();
    return data.beneficiaries;
}
