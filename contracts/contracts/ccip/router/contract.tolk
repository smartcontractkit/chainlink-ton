import "messages"
import "storage"
import "errors"
import "../onramp/messages"
import "../onramp/types"
import "../common/messages"
import "../../lib/access/ownable_2step"
import "../../lib/funding/withdrawable.tolk"
import "../../deployable/types"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
import "../../lib/jetton/messages"
import "../../lib/jetton/messages_extended"
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../offramp/messages"
import "@stdlib/lisp-lists"
import "../offramp/types"


const CONTRACT_VERSION = "0.0.7";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in: InMessage) {
    val msg = lazy Router_InMsg.fromSlice(in.body);
    match (msg) {
        Router_SetRamps => {onSetRamps(msg, in.senderAddress)}
        Router_UpdateOffRamps => { onUpdateOffRamps(msg, in.senderAddress) }
        Router_CCIPSend => { onSend(msg, in.senderAddress) }
        Router_RouteMessage => { 
            routeMessage(msg, in.senderAddress)
            }
        Router_CCIPReceiveConfirm => { ccipReceiveConfirm(msg, in.senderAddress) }
        Router_RMNRemoteCurse => {
            var st = lazy Storage.load();
            var rmn = st.rmnRemote.load();
            rmn.admin.requireOwner(in.senderAddress);
            var subjects = msg.subjects.iter();
            while (!subjects.empty()) {
                val subject = subjects.next();  
                rmn.cursedSubjects.curse(subject);
            }
            st.rmnRemote = rmn.toCell();
            st.store();

            // propagate update to cache
            var entry = rmn.forwardUpdates.findFirst();
            while (entry.isFound) {
                val destination = entry.getKey();
                val sendMsg = createMessage({
                    bounce: false,
                    value: ton("0.05"),
                    dest: destination,
                    body: OffRamp_UpdateCursedSubjects { cursedSubjects: rmn.cursedSubjects },
                });
                sendMsg.send(SEND_MODE_IGNORE_ERRORS);
                entry = rmn.forwardUpdates.iterateNext(entry);
            }
        }
        Router_RMNRemoteUncurse => {
            var st = lazy Storage.load();
            var rmn = st.rmnRemote.load();
            rmn.admin.requireOwner(in.senderAddress);
            var subjects = msg.subjects.iter();
            while (!subjects.empty()) {
                val subject = subjects.next();  
                rmn.cursedSubjects.uncurse(subject);
            }
            st.rmnRemote = rmn.toCell();
            st.store();

            // propagate update to offramp cache
            var entry = rmn.forwardUpdates.findFirst();
            while (entry.isFound) {
                val destination = entry.getKey();
                val sendMsg = createMessage({
                    bounce: false,
                    value: ton("0.05"),
                    dest: destination,
                    body: OffRamp_UpdateCursedSubjects { cursedSubjects: rmn.cursedSubjects },
                });
                sendMsg.send(SEND_MODE_IGNORE_ERRORS);
                entry = rmn.forwardUpdates.iterateNext(entry);
            }
        }
        Router_RMNRemoteVerifyNotCursed => {
            val result = verifyNotCursed(msg.subject);
            val reply = createMessage({
                bounce: false,
                value: ton("0.05"),
                dest: in.senderAddress,
                body: Router_RMNRemoteVerifyNotCursedResponse { queryId: msg.queryId, result },
            });
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        Common_JettonTransferNotification => { onTransferNotification(msg, in.senderAddress) }
        Withdrawable_Withdraw => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        Router_MessageSent => { onSendACK(msg, in.senderAddress) }
        Router_MessageRejected => { onSendNACK(msg, in.senderAddress) }
        Upgradeable_Upgrade => { onUpgrade(msg, in.senderAddress) }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy Router_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
      // We are lazy matching and only accessing the first element of the struct.
      // The rest of the data is not a part of the bounced body so it cannot be accessed
      Receiver_CCIPReceive => { ccipReceiveBounced(msg.execId, in.senderAddress) }
    }
}

fun routeMessage(msg: Router_RouteMessage, sender: address) {
    val st = lazy Storage.load();
    val message: Any2TVMMessage = msg.message.load();

    val expectedOffRamp = st.offRamps.mustGet(message.sourceChainSelector, Router_Error.DestChainNotEnabled as int);
    assert(sender == expectedOffRamp, Router_Error.SenderIsNotOffRamp);


    val ccipReceive: Receiver_CCIPReceive = {
        execId: msg.execId,
        message,
    };

    val messageForReceiver = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO: use the gas limit from the message
        dest: msg.receiver,
        body: ccipReceive
    });
    messageForReceiver.send(SEND_MODE_REGULAR);

}

fun onSetRamps(msg: Router_SetRamps, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    var selectors = msg.destChainSelectors.iter();
    while (!selectors.empty()) {
        val selector = selectors.next();
        st.onRamps.set(selector, msg.onRamp);
    }
    st.store();
    // TODO: emit(OnRampsSet)
}

fun onUpdateOffRamps(msg: Router_UpdateOffRamps, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    if (msg.offRampAdd != null) {
        val offRampAdd = msg.offRampAdd!;
        var iter = msg.sourceChainSelectorsAdd.iter();
        while (!iter.empty()) {
            val selector = iter.next();
            st.offRamps.set(selector, offRampAdd);
        }
    }
    if (msg.offRampRemove != null) {
        val offRampRemove = msg.offRampRemove!;
        var iter = msg.sourceChainSelectorsRemove.iter();
        while (!iter.empty()) {
            val selector = iter.next();
            val existing = st.offRamps.mustGet(selector, Router_Error.OffRampNotSetForSelector as int);
            assert (existing == offRampRemove) throw Router_Error.OffRampAddressMismatch;
            st.offRamps.delete(selector);
        }
    }

    // update RMN forwarding cache
    var rmn = st.rmnRemote.load();
    var forwardUpdates = createEmptyMap<address, ()>();
    var entry = st.offRamps.findFirst(); 
    while (entry.isFound) {
        val ramp = entry.loadValue();
        forwardUpdates.addIfNotExists(ramp, ());
        entry = st.offRamps.iterateNext(entry);
    }
    rmn.forwardUpdates = forwardUpdates;
    st.rmnRemote = rmn.toCell();
    st.store();
}

fun ccipReceiveConfirm(msg: Router_CCIPReceiveConfirm, sender: address) {
    val st = lazy Storage.load();
    val sourceChainSelector = msg.execId.getSourceChainSelector();

    val offRamp: address = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled as int);

    val confirmMsg = createMessage({
        bounce: true,
        value: ton("0"), 
        dest: offRamp,
        body: OffRamp_CCIPReceiveConfirm {
            execId: msg.execId,
            receiver: sender,
        },
    });
    confirmMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun ccipReceiveBounced(execId: ReceiveExecutorId, sender: address) {
    val st = Storage.load();
    val sourceChainSelector = execId.getSourceChainSelector();
    val offRamp = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled as int);

    val receiveBounced = createMessage({
        bounce: true,
        value: ton("0.05"),
        dest: offRamp,
        body: OffRamp_CCIPReceiveBounced {
            execId: execId,
            receiver: sender,
        }
    });
    receiveBounced.send(SEND_MODE_REGULAR);
}


fun onSend(msg: Router_CCIPSend, sender: address) {
    ccipSend(msg, sender);
}

fun onTransferNotification(transferNotification: Common_JettonTransferNotification, wallet: address) {
    val st = lazy Storage.load();

    // TBD: I think we don't need to validate the sender here. If it is not a Jetton Wallet, it would not be able to transfer the jettons?

    // TODO: need to validate that the transfer notification came from our own wallet
    // assert(sender == st.owner) throw Error.NotOwner;
    // TODO: need to validate the jetton (master) address, but to do this we need to
    // derive the address. We can probably fetch that from the ccip send payload's tokenAmounts

    // TODO: catch errors, if different message type than CCIPSend
    val sendMsg = Router_CCIPSend.fromCell(transferNotification.forwardPayload!);
    var tokenAmounts = sendMsg.tokenAmounts.iter();
    // TODO handle payment in LINK if this is a LINK transfer
    assert (!tokenAmounts.empty()) throw Router_Error.MissingTokenAmounts;
    val transferedJetton = tokenAmounts.next();
    assert (transferedJetton.amount == transferNotification.amount) throw 5; // TODO: if transfered token is link, extract fee before this check
    assert (tokenAmounts.empty()) throw Router_Error.NoMultiTokenTransfers;

    // TODO: store msg.amount + value
    // make sure msg.amount == sendMsg.token amount
    val onRamp = st.onRamps.mustGet(sendMsg.destChainSelector, Router_Error.DestChainNotEnabled as int);

    val transferMessage = createMessage({
        bounce: true,
        value: 0, // TODO:
        dest: wallet,
        body: AskToTransferFwdPayload {
            queryId: sendMsg.queryID,
            jettonAmount: transferNotification.amount,
            transferRecipient: onRamp,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: ton("0.5"), // TODO
            forwardPayload: OnRamp_Send { msg: sendMsg.toCell(), metadata: Metadata{ sender: transferNotification.sender } }.toCell(),
        },
    });
    transferMessage.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);


    // TODO: Forward excesses
    // self.forward(msg.sender, null, false, null);
}

fun ccipSend(msg: Router_CCIPSend, sender: address) {
    val st = lazy Storage.load();

    // verify destination chain not cursed
    var rmn = st.rmnRemote.load();
    val isCursed = rmn.cursedSubjects.isCursed(msg.destChainSelector as uint128);
    assert(!isCursed, Router_Error.SubjectCursed as int);

    // forward to onRamp
    // ccipSend(onRamp, msg, value/token amounts)

    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Router_Error.DestChainNotEnabled as int);
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRamp,
        body: OnRamp_Send { msg: msg.toCell(), metadata: Metadata{ sender } },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onSendACK(msg: Router_MessageSent, sender: address) {
    val st = lazy Storage.load();
    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRamp) throw Router_Error.NotOnRamp;

    val ackMsg = createMessage({
        bounce: true,
        value: 0,
        dest: msg.sender,
        body: Router_CCIPSendACK {
            queryID: msg.queryID,
            messageId: msg.messageId,
        }
    });

    ackMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onSendNACK(msg: Router_MessageRejected, sender: address) {
    val st = lazy Storage.load();
    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRamp) throw Router_Error.NotOnRamp;

    val nackMsg = createMessage({
        bounce: true,
        value: 0,
        dest: msg.sender,
        body: Router_CCIPSendNACK {
            queryID: msg.queryID,
            error: msg.error,
        }
    });

    nackMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onUpgrade(msg: Upgradeable_Upgrade, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);
    Upgradeable{ migrate, version }.upgrade(msg);
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun verifyNotCursed(subject: uint128): bool {
    val st = lazy Storage.load();
    var rmn = st.rmnRemote.load();
    return rmn.cursedSubjects.isCursed(subject);
}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.Router", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.Router"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.Router"), local);
}

get fun onRamp(destChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.onRamps.mustGet(destChainSelector, Router_Error.DestChainNotEnabled as int);
}

get fun offRamp(sourceChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled as int);
}

struct Ramp {
    chainSelector: uint64
    ramp: address
}

get fun onRamps() {
    val st = lazy Storage.load();
    var list: tuple? = null;
    var r = st.onRamps.findFirst();
    while (r.isFound) {
        val ramp = Ramp {
            chainSelector: r.getKey(),
            ramp: r.loadValue(),
        };
        list = listPrepend(ramp.toCell(), list);
        r = st.onRamps.iterateNext(r);
    }
    return list;
}

//returns lispList<OffRamp>
get fun offRamps() {
    val st = lazy Storage.load();
    var list: tuple? = null;
    var r = st.offRamps.findFirst();
    while (r.isFound) {
        val ramp = Ramp {
            chainSelector: r.getKey(),
            ramp: r.loadValue(),
        };
        var cs = ramp.toCell().beginParse();
        list = listPrepend(ramp.toCell(), list);
        r = st.offRamps.iterateNext(r);
    }
    return list;
}

get fun destChainSelectors(): tuple {
    val st = lazy Storage.load();
    var d = st.onRamps;
    return keysLispList(d)!;
}

get fun reserve(): coins {
    return RESERVE;
}

