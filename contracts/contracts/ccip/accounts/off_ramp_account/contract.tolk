// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "../../../lib/jetton/messages"
import "types"
import "messages"
import "storage"

contract OffRampAccount {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.OffRampAccount"

    storage: OffRampAccount_Data
    incomingMessages:
        | OffRampAccount_InMessage
    outgoingMessages:
        | OffRampAccount_OutMessage
}

/// @notice Handles all incoming messages.
/// Init deploys the account. Jetton notifications are forwarded to the pool.
fun onInternalMessage(in: InMessage) {
    var data = OffRampAccount_Data.fromContractData();
    val msg = lazy OffRampAccount_InMessage.fromSlice(in.body);

    match (msg) {
        OffRampAccount_Init => {
            onInit(mutate data, in.senderAddress, msg);
            data.storeAsContractData();
        }
        OffRampAccount_Withdraw => {
            onWithdraw(mutate data, in.senderAddress, msg);
            data.storeAsContractData();
        }
        else => {
            // Only forward messages from the allowed jetton wallet.
            // This is the safety filter (like CE's forwardFrom) — prevents spam from random jettons.
            if (data.allowedJettonWallet != null && in.senderAddress == data.allowedJettonWallet!) {
                val notification = createMessage({
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: data.notificationTarget,
                    body: OffRampAccount_ForwardNotification {
                        message: OffRampAccount_InMessageForward {
                            senderAddress: in.senderAddress,
                            valueCoins: in.valueCoins,
                            valueExtra: in.valueExtra,
                            originalForwardFee: in.originalForwardFee,
                            createdLt: in.createdLt,
                            createdAt: in.createdAt,
                            body: in.body.toCell(),
                        }.toCell(),
                    },
                });
                notification.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

                return;
            }

            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// @notice Handles initialization: stores config and sends Reply to notificationTarget (pool).
fun onInit(mutate data: OffRampAccount_Data, sender: address, msg: OffRampAccount_Init) {
    assert(sender == data.notificationTarget, OffRampAccount_Error.OnlyOwner);

    data.allowedJettonWallet = msg.allowedJettonWallet;

    // Send Reply to the pool so it knows the account is ready.
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: data.notificationTarget,
        body: OffRampAccount_Reply {
            queryId: msg.queryId,
            forwardPayload: msg.forwardPayload,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// @notice Allows the owner (recipient) to withdraw jettons from this account's wallet.
fun onWithdraw(mutate data: OffRampAccount_Data, sender: address, msg: OffRampAccount_Withdraw) {
    assert(sender == data.owner, OffRampAccount_Error.OnlyOwner);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: ton("0.1"),
        dest: msg.walletAddress,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipient,
            sendExcessesTo: null,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

get fun typeAndVersion(): (slice, slice) {
    return (OffRampAccount_CONTRACT_NAME, OffRampAccount_CONTRACT_VERSION);
}

get fun getOwner(): address {
    val data = lazy OffRampAccount_Data.fromContractData();
    return data.owner;
}

get fun getNotificationTarget(): address {
    val data = lazy OffRampAccount_Data.fromContractData();
    return data.notificationTarget;
}