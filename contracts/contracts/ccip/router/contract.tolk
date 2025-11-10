import "messages"
import "storage"
import "errors"
import "../onramp/messages"
import "../onramp/types"
import "../../lib/access/ownable_2step"
import "../../lib/funding/withdrawable.tolk"
import "../../deployable/types"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
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
        Router_CCIPSend => { 
            val minValue = Router_Costs.CCIPSend();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;
            onSend(msg, in.senderAddress, in.valueCoins)
            }
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

            // propagate update to caches
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

            // propagate update to caches
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
            // attempt to handle Ownable messages
            var st = lazy Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }

            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF;
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
        value: msg.gasLimit,
        dest: msg.receiver,
        body: ccipReceive,
    });
    messageForReceiver.send(SEND_MODE_PAY_FEES_SEPARATELY);
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

fun onSend(msg: Router_CCIPSend, sender: address, value: coins) {
    ccipSend(msg, sender, value);
}

fun ccipSend(msg: Router_CCIPSend, sender: address, value: coins) {
    val st = lazy Storage.load();

    // verify destination chain not cursed
    var rmn = st.rmnRemote.load();
    val isCursed = rmn.cursedSubjects.isCursed(msg.destChainSelector as uint128);
    assert(!isCursed, Router_Error.SubjectCursed);

    // TODO: the feeToken typing will need to change to `address?` and comparing with `null` in upcoming Tolk 1.2
    if (msg.feeToken.isNone()) {
        msg.feeToken = st.wrappedNative
    }

    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Router_Error.DestChainNotEnabled as int);
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRamp,
        body: OnRamp_Send { msg: msg.toCell(), metadata: Metadata{ sender, value } },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onSendACK(msg: Router_MessageSent, sender: address) {
    val st = lazy Storage.load();
    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRamp) throw Router_Error.NotOnRamp;

    val ackMsg = createMessage({
        bounce: false,
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
