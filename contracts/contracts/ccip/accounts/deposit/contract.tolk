// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "@stdlib/common"
import "@stdlib/gas-payments"

import "../../../lib/utils"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/forward_payload_wrap"

import "types"
import "messages"

/// Escrows a single jetton for a single user (see `DepositAccount_Data`).
contract DepositAccount {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.account.DepositAccount"

    storage: DepositAccount_Data
    incomingMessages:
        | DepositAccount_InMessage
    outgoingMessages:
        | DepositAccount_OutMessage
    forceAbiExport: Jetton_ForwardPayloadWrap
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

@inline
fun DepositAccount_Data.load(): DepositAccount_Data {
    return DepositAccount_Data.fromCell(contract.getData());
}

@inline
fun DepositAccount_Data.store(self) {
    contract.setData(self.toCell());
}

/// Unrecognized messages, including a retried `Deployable_Initialize`, bounce.
fun onInternalMessage(in: InMessage) {
    val msg = lazy DepositAccount_InMessage.fromSlice(in.body);
    match (msg) {
        DepositAccount_Init => {
            onInit(in.senderAddress, in.valueCoins, msg);
        }
        DepositAccount_Withdraw => {
            onWithdraw(in.senderAddress, msg, in.body.toCell());
        }
        TransferNotificationForRecipient => {
            onTransferNotification(in.senderAddress, msg, in.body);
        }
        ResponseWalletAddress => {
            onResponseWalletAddress(in.senderAddress, msg);
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val bounced = lazy DepositAccount_BouncedMessage.fromCell(rich.originalBody);
    match (bounced) {
        AskToTransfer => {
            onWithdrawBounced(in.senderAddress, bounced);
        }
        RequestWalletAddress => {
            var data = DepositAccount_Data.load();
            if (data.pendingInit != null) {
                replyToPendingInit(mutate data, false);
                data.store();
            }
        }
        else => {}
    }
}

fun onInit(sender: address, msgValue: coins, msg: DepositAccount_Init) {
    var data = DepositAccount_Data.load();
    assert(sender == data.owner, DepositAccount_Error.OnlyOwner);
    val waitForWallet = data.wallet == null;
    val initCost = DepositAccount_MIN_GRAM_TO_INIT + (waitForWallet ? DepositAccount_WALLET_QUERY_VALUE : 0);
    // `getOriginalBalance` already includes the inbound value.
    assert(
        contract.getOriginalBalance() >= DepositAccount_MIN_GRAM_TO_RESERVE + initCost && msgValue >= initCost,
        DepositAccount_Error.NotEnoughValue
    );

    if (!waitForWallet) {
        reserveGramsOnBalance(DepositAccount_MIN_GRAM_TO_RESERVE, RESERVE_MODE_EXACT_AMOUNT);
        val reply = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: sender,
            body: DepositAccount_Initialized {
                queryId: msg.queryId,
                context: msg.context,
            },
        });
        // SAFETY: reserveGramsOnBalance is called before
        reply.send(SEND_MODE_CARRY_ALL_BALANCE);
        return;
    }

    assert(data.pendingInit == null, DepositAccount_Error.InitPending);
    data.pendingInit = DepositAccount_PendingInit {
        queryId: msg.queryId,
        context: msg.context,
    }.toCell();
    data.store();
    val query = createMessage({
        bounce: BounceMode.RichBounce,
        value: DepositAccount_WALLET_QUERY_VALUE,
        dest: data.token,
        body: RequestWalletAddress {
            queryId: msg.queryId,
            ownerAddress: contract.getAddress(),
            includeOwnerAddress: false,
        },
    });
    query.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onResponseWalletAddress(sender: address, msg: ResponseWalletAddress) {
    var data = DepositAccount_Data.load();
    assert(sender == data.token, DepositAccount_Error.OnlyToken);
    assert(data.pendingInit != null, DepositAccount_Error.NoPendingInit);
    if (msg.jettonWalletAddress != null) {
        data.wallet = msg.jettonWalletAddress.toCell();
    }
    replyToPendingInit(mutate data, msg.jettonWalletAddress != null);
    data.store();
}

fun replyToPendingInit(mutate data: DepositAccount_Data, walletLearned: bool) {
    val pending = data.pendingInit!.load();
    data.pendingInit = null;
    reserveGramsOnBalance(DepositAccount_MIN_GRAM_TO_RESERVE, RESERVE_MODE_EXACT_AMOUNT);
    if (walletLearned) {
        createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: data.owner,
            body: DepositAccount_Initialized { queryId: pending.queryId, context: pending.context },
        }).send(SEND_MODE_CARRY_ALL_BALANCE);
    } else {
        createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: data.owner,
            body: DepositAccount_WalletUnavailable { queryId: pending.queryId, context: pending.context },
        }).send(SEND_MODE_CARRY_ALL_BALANCE);
    }
}

fun onWithdraw(sender: address, msg: DepositAccount_Withdraw, msgCell: cell) {
    val data = lazy DepositAccount_Data.load();
    assert(data.beneficiaries.exists(sender), DepositAccount_Error.OnlyBeneficiary);
    assert(data.wallet != null, DepositAccount_Error.WalletUnknown);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: data.wallet.load(),
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.ask.jettonAmount,
            transferRecipient: msg.ask.transferRecipient,
            sendExcessesTo: msg.ask.sendExcessesTo,
            customPayload: msg.ask.customPayload,
            forwardTonAmount: msg.ask.forwardTonAmount,
            forwardPayload: Jetton_ForwardPayloadWrap {
                initiator: sender,
                forwardPayload: msg.ask.forwardPayload,
                // @notice we use msgCell as an optimization to avoid reconstructing the cell from the message body
                context: msgCell,
            }.toCell().toForwardPayload(),
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Reports the bounced withdraw to its requester.
fun onWithdrawBounced(wallet: address, ask: AskToTransfer) {
    val data = lazy DepositAccount_Data.load();
    val wrap = Jetton_ForwardPayloadWrap.from(ask.forwardPayload).unwrap(DepositAccount_Error.InvalidForwardPayload);
    assert(wrap.context != null && wrap.forwardPayload != null, DepositAccount_Error.InvalidForwardPayload);
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: wrap.initiator,
        body: DepositAccount_WithdrawFailed {
            queryId: ask.queryId,
            user: data.user,
            token: data.token,
            walletAddress: wallet,
            request: wrap.context as Cell<DepositAccount_Withdraw>,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Notifications from any sender are forwarded to `user`; only those from the account's learned
/// jetton wallet may be redirected through a `DepositAccount_Notify`.
fun onTransferNotification(sender: address, msg: TransferNotificationForRecipient, body: slice) {
    val data = lazy DepositAccount_Data.load();
    val notifyTarget = data.wallet != null && sender == data.wallet.load()
        ? parseNotifyTarget(msg.forwardPayload)
        : null;
    val notification = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: notifyTarget.unwrapOr(data.user),
        body: DepositAccount_ForwardNotification {
            notification: beginCell().storeSlice(body).endCell() as Cell<TransferNotificationForRecipient>,
        },
    });
    notification.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Returns the `DepositAccount_Notify` target in `forwardPayload`, directly or inside a
/// `Jetton_ForwardPayloadWrap`, or `null` if there is none.
fun parseNotifyTarget(forwardPayload: ForwardPayloadRemainder): address? {
    try {
        var payload = loadForwardPayloadAsCell(forwardPayload);
        val wrap = Jetton_ForwardPayloadWrap.from(forwardPayload);
        if (wrap != null) {
            payload = wrap!.forwardPayload;
        }
        if (payload == null) {
            return null;
        }
        return DepositAccount_Notify.fromCell(payload!).notify;
    } catch {
        return null;
    }
}

get fun typeAndVersion(): (slice, slice) {
    return (DepositAccount_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16 {
    return DepositAccount_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(DepositAccount_FACILITY_NAME.crc32(), local);
}

get fun getOwner(): address {
    val data = lazy DepositAccount_Data.load();
    return data.owner;
}

get fun getUser(): address {
    val data = lazy DepositAccount_Data.load();
    return data.user;
}

get fun getToken(): address {
    val data = lazy DepositAccount_Data.load();
    return data.token;
}

/// Returns null if the wallet was never learned.
get fun getWallet(): address? {
    val data = lazy DepositAccount_Data.load();
    return data.wallet == null ? null : data.wallet.load();
}

get fun getBeneficiaries(): map<address, ()> {
    val data = lazy DepositAccount_Data.load();
    return data.beneficiaries;
}
