import "messages"
import "storage"
import "errors"
import "../onramp/messages"
import "../onramp/types"
import "../../lib/funding/withdrawable.tolk"
import "../../deployable/types"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../offramp/messages"
import "@stdlib/lisp-lists"
import "types"
import "../offramp/types"
import "events"

const CONTRACT_VERSION = "1.6.0";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in: InMessage) {
    val msg = lazy Router_InMsg.fromSlice(in.body);
    match (msg) {
        Router_ApplyRampUpdates => { onApplyRampUpdates(msg, in.senderAddress) }
        Router_CCIPSend => {
            val minValue = Router_Costs.CCIPSend();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;
            onSend(msg, in.senderAddress, in.valueCoins)
        }
        Router_GetValidatedFee<RemainingBitsAndRefs> => {
            val minValue = Router_Costs.GetValidatedFee();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;
            onGetValidatedFee(msg, in.senderAddress)
        }
        OnRamp_MessageValidated<Router_GetValidatedFeeContext> => {
            onMessageValidated(msg, in.senderAddress)
        }
        OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext> => {
            onMessageValidationFailed(msg, in.senderAddress)
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
                emit(
                    CURSED_TOPIC,
                    Cursed {
                        subject: subject,
                    }
                )
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
                emit(
                    UNCURSED_TOPIC,
                    Uncursed {
                        subject: subject,
                    }
                )
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
        Router_RMNOwnableMessage => {
            var st = lazy Storage.load();
            var rmnRemote = st.rmnRemote.load();
            val handled = rmnRemote.admin.onInternalMessage(in.senderAddress, msg.content);
            if (handled) {
                st.rmnRemote = rmnRemote.toCell();
                st.store();
                return;
            }
            throw 0xFFFF;
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

fun onApplyRampUpdates(msg: Router_ApplyRampUpdates, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    updateOnRamps(msg.onRampUpdates);
    updateOffRamps(msg.offRampAdds, msg.offRampRemoves);
}

fun updateOnRamps(onRampUpdates: OnRamps?) {
    var st = lazy Storage.load();

    if (onRampUpdates != null) {
        var selectors = onRampUpdates.destChainSelectors.iter();
        while (!selectors.empty()) {
            val selector = selectors.next();
            st.onRamps.set(selector, onRampUpdates.onRamp);
        }

        st.store();

        emit(ON_RAMP_SET_TOPIC, OnRampSet {
            destChainSelectors: onRampUpdates.destChainSelectors,
            onRamp: onRampUpdates.onRamp,
        });
    }
}

fun updateOffRamps(offRampAdds: OffRamps?, offRampRemoves: OffRamps?) {
    var st = lazy Storage.load();

    if (offRampAdds != null) {
        val offRampAdd = offRampAdds.offRamp!;
        var iter = offRampAdds.sourceChainSelectors.iter();
        while (!iter.empty()) {
            val selector = iter.next();
            st.offRamps.set(selector, offRampAdd);
        }

        emit(OFF_RAMP_ADDED_TOPIC, OffRampAdded {
            sourceChainSelectors: offRampAdds.sourceChainSelectors,
            offRampAdded: offRampAdd,
        });
    }

    if (offRampRemoves != null) {
        val offRampRemove = offRampRemoves.offRamp!;
        var iter = offRampRemoves.sourceChainSelectors.iter();
        while (!iter.empty()) {
            val selector = iter.next();
            val existing = st.offRamps.mustGet(selector, Router_Error.OffRampNotSetForSelector as int);
            assert (existing == offRampRemove) throw Router_Error.OffRampAddressMismatch;
            st.offRamps.delete(selector);
        }

        emit(OFF_RAMP_REMOVED_TOPIC, OffRampRemoved {
            sourceChainSelectors: offRampRemoves.sourceChainSelectors,
            offRampRemoved: offRampRemove,
        });
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
        value: OffRamp_Costs.receiveConfirmOrDeny(), 
        dest: offRamp,
        body: OffRamp_CCIPReceiveConfirm {
            execId: msg.execId,
            receiver: sender,
        },
    });
    confirmMsg.send(SEND_MODE_REGULAR);
}

fun ccipReceiveBounced(execId: ReceiveExecutorId, sender: address) {
    val st = Storage.load();
    val sourceChainSelector = execId.getSourceChainSelector();
    val offRamp = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled as int);

    val receiveBounced = createMessage({
        bounce: true,
        value: OffRamp_Costs.receiveConfirmOrDeny(),
        dest: offRamp,
        body: OffRamp_CCIPReceiveBounced {
            execId: execId,
            receiver: sender,
        }
    });
    receiveBounced.send(SEND_MODE_REGULAR);
}

fun onGetValidatedFee(msg: Router_GetValidatedFee<RemainingBitsAndRefs>, sender: address) {
    val st = lazy Storage.load();
    val ccipSend = lazy msg.ccipSend.load();
    val onRamp = st.onRamps.mustGet(ccipSend.destChainSelector, Router_Error.DestChainNotEnabled as int);

    val feeQuoterMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRamp,
        body: OnRamp_GetValidatedFee<Router_GetValidatedFeeContext> {
            ccipSend: msg.ccipSend,
            context: Router_GetValidatedFeeContext {
                routerContext: sender,
                userContext: msg.context,
            },
        }
    });

    feeQuoterMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onMessageValidated(msg: OnRamp_MessageValidated<Router_GetValidatedFeeContext>, sender: address) {
    val st = lazy Storage.load();
    val ccipSend = lazy msg.msg.load();
    val onRampAddress = st.onRamps.mustGet(ccipSend.destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRampAddress) throw Router_Error.NotOnRamp;
    val userAddress = msg.context.routerContext;
    val replyMsg = createMessage({
        bounce: false,
        value: 0,
        dest: userAddress,
        body: Router_MessageValidated {
            fee: msg.fee,
            msg: msg.msg,
            context: msg.context.userContext,
        }
    });
    replyMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onMessageValidationFailed(msg: OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext>, sender: address) {
    val st = lazy Storage.load();
    val ccipSend = lazy msg.msg.load();
    val onRampAddress = st.onRamps.mustGet(ccipSend.destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRampAddress) throw Router_Error.NotOnRamp;

    val userAddress = msg.context.routerContext;
    val replyMsg = createMessage({
        bounce: true,
        value: 0,
        dest: userAddress,
        body: Router_MessageValidationFailed {
            error: msg.error,
            msg: msg.msg,
            context: msg.context.userContext,
        }
    });
    replyMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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

/// Gets the current owner of the contract.
get fun owner(): address {
    val st = lazy Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val st = lazy Storage.load();
    return st.ownable.get_pendingOwner();
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
