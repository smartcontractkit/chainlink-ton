// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "types"
import "messages"
import "storage"


/// @notice Per-recipient account deployed by CCIP token pools.
/// Receives jetton mint/withdraw notifications from the jetton wallet and forwards them to the pool
/// so the pool can finalize the cross-chain release or mint operation.
/// The account owner (recipient) can withdraw jettons at any time.
/// @dev Only messages from the allowed jetton wallet are forwarded — all other unrecognized messages bounce.
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

/// @notice Dispatches incoming messages: Init from pool, Withdraw from owner, jetton notifications forwarded, everything else bounces.
fun onInternalMessage(in: InMessage) {
    var data = OffRampAccount_Data.load();
    val msg = lazy OffRampAccount_InMessage.fromSlice(in.body);

    match (msg) {
        OffRampAccount_Init => {
            onInit(mutate data, in.senderAddress, msg);
            data.store();
        }
        OffRampAccount_Withdraw => {
            onWithdraw(data, in.senderAddress, msg);
        }
        else => {
            // Forward known jetton messages from the allowed wallet; bounce everything else.
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

/// @notice Called by the pool to activate the account and set the allowed jetton wallet.
/// @dev Only the pool (notificationTarget) can call this.
fun onInit(mutate data: OffRampAccount_Data, sender: address, msg: OffRampAccount_Init) {
    assert(sender == data.notificationTarget, OffRampAccount_Error.OnlyPool);

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
/// @dev Sends the jetton transfer directly to the wallet — on-chain message, no gas refund on failure.
fun onWithdraw(data: OffRampAccount_Data, sender: address, msg: OffRampAccount_Withdraw) {
    assert(sender == data.owner, OffRampAccount_Error.OnlyOwner);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce, // TODO: notify sender (data.owner) that transfer failed
        value: 0,
        dest: msg.walletAddress,
        body: msg.ask,
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

get fun typeAndVersion(): (slice, slice) {
    return (OffRampAccount_CONTRACT_NAME, OffRampAccount_CONTRACT_VERSION);
}

get fun getOwner(): address {
    val data = lazy OffRampAccount_Data.load();
    return data.owner;
}

get fun getNotificationTarget(): address {
    val data = lazy OffRampAccount_Data.load();
    return data.notificationTarget;
}

get fun getAllowedJettonWallet(): address? {
    val data = lazy OffRampAccount_Data.load();
    return data.allowedJettonWallet;
}
