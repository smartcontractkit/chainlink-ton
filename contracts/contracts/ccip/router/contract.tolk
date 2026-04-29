// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../../lib/funding/withdrawable.tolk"
import "../../lib/deployable/types"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"

import "../onramp/messages"
import "../onramp/types"
import "../offramp/messages"
import "../offramp/types"

import "types"
import "messages"
import "storage"
import "errors"
import "events"

const CONTRACT_VERSION = "1.6.0";
const RESERVE = ton("1");

fun onInternalMessage(in: InMessage) {
    val msg = lazy Router_InMsg.fromSlice(in.body);
    match (msg) {
        // Sender must be owner
        Router_ApplyRampUpdates => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onApplyRampUpdates(mutate st, msg);
            st.store();
        }
        // Permissionless
        Router_CCIPSend => {
            val minValue = Router_Costs.CCIPSend();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;
            onCCIPSend(msg, in.senderAddress, in.valueCoins);
        }
        // Permissionless
        Router_GetValidatedFee<RemainingBitsAndRefs> => {
            val minValue = Router_Costs.GetValidatedFee();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;
            onGetValidatedFee(msg, in.senderAddress);
        }
        // Sender must be Onramp
        OnRamp_MessageValidated<Router_GetValidatedFeeContext> => {
            val st = lazy Storage.load();
            val ccipSend = lazy msg.msg.load();
            assertSenderIsOnRamp(st, ccipSend.destChainSelector, in.senderAddress);
            onMessageValidatedFromOnRamp(msg);
        }
        // Sender must be OnRamp
        OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext> => {
            val st = lazy Storage.load();
            val ccipSend = lazy msg.msg.load();
            assertSenderIsOnRamp(st, ccipSend.destChainSelector, in.senderAddress);
            onMessageValidationFailedFromOnRamp(msg);
        }
        // Sender must be OffRamp
        Router_RouteMessage => {
            val st = lazy Storage.load();
            val message: Any2TVMMessage = msg.message.load();
            val expectedOffRamp = st.offRamps.mustGet(message.sourceChainSelector, Router_Error.SourceChainNotEnabled as int);
            assert(in.senderAddress == expectedOffRamp, Router_Error.SenderIsNotOffRamp);
            onRouteMessage(msg, message);
        }
        // Permissionless (authorization is handle at the ReceiverExecutor)
        Router_CCIPReceiveConfirm => {
            // Check that the amount sent by the receiver is enough to cover confirmation trace costs. 
            // Approx 0.02 TON.
            assert(in.valueCoins >= Router_Costs.receiveConfirm()) throw Router_Error.InsufficientFee;
            onCCIPReceiveConfirm(msg, in.senderAddress);
        }
        // Sender must RMN remote admin
        Router_RMNRemoteCurse => {
            var st = lazy Storage.load();
            var rmn = st.rmnRemote.load();
            rmn.admin.requireOwner(in.senderAddress);
            onRMNRemoteCurse(st, rmn, msg);
        }
        // Sender must RMN remote admin
        Router_RMNRemoteUncurse => {
            var st = lazy Storage.load();
            var rmn = st.rmnRemote.load();
            rmn.admin.requireOwner(in.senderAddress);
            onRMNRemoteUncurse(st, rmn, msg);
        }
        // Permissionless
        Router_RMNRemoteVerifyNotCursed => {
            val result = verifyNotCursed(msg.subject);
            val reply = createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: Router_RMNRemoteVerifyNotCursedResponse { queryId: msg.queryId, result },
            });
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        // Sender must RMN remote admin (checked in Ownable2Step struct)
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
        // Sender must be owner
        Withdrawable_Withdraw => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        // Sender must be owner
        Upgradeable_Upgrade => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onUpgrade(msg);
        }
        // Sender must be OnRamp
        Router_MessageSent => {
            val st = lazy Storage.load();
            assertSenderIsOnRamp(st, msg.destChainSelector, in.senderAddress);

            onSendACK(msg)
        }
        // Sender must be OnRamp
        Router_MessageRejected => {
            val st = lazy Storage.load();
            assertSenderIsOnRamp(st, msg.destChainSelector, in.senderAddress);

            onSendNACK(msg)
        }
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
      Receiver_CCIPReceive => { onCCIPReceiveBounced(msg.execId, in.senderAddress) }
      // We cannot take any action if the OffRamp is bouncing the Router messages other than to emit an event for visibility
      OffRamp_CCIPReceiveConfirm => {
        emit(MESSAGE_TO_OFF_RAMP_BOUNCED_TOPIC, MessageToOffRampBounced {
            offRamp: in.senderAddress,
            execId: msg.execId,
        });
      }
      OffRamp_CCIPReceiveBounced => {
        emit(MESSAGE_TO_OFF_RAMP_BOUNCED_TOPIC, MessageToOffRampBounced {
            offRamp: in.senderAddress,
            execId: msg.execId,
        });
      }
    }
}

// Routes a validated message to its intended receiver contract.
//
// sequenceDiagram
//     participant Receiver
//     participant Router
//     participant OffRamp
//     participant ReceiveExecutor

//     ReceiveExecutor ->> OffRamp:  OffRamp_DispatchValidated
//     OffRamp         ->> Router:   Router_RouteMessage (process)
//     Router          ->> Receiver: Receiver_CCIPReceive
fun onRouteMessage(msg: Router_RouteMessage, message: Any2TVMMessage) {
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

/*
Applies OnRamp and OffRamp updates. Restricted to contract owner.
*/
fun onApplyRampUpdates(mutate st: Storage, msg: Router_ApplyRampUpdates) {
    updateOnRamps(mutate st, msg.onRampUpdates);
    updateOffRamps(mutate st, msg.offRampAdds, msg.offRampRemoves);
}

fun updateOnRamps(mutate st: Storage, onRampUpdates: OnRamps?) {
    if (onRampUpdates != null) {
        var selectors = onRampUpdates.destChainSelectors.iter();
        while (!selectors.empty()) {
            val selector = selectors.next();
            if (onRampUpdates.onRamp != null) {
                st.onRamps.set(selector, onRampUpdates.onRamp);
            } else {
                st.onRamps.delete(selector);
            }
        }

        emit(ON_RAMP_SET_TOPIC, OnRampSet {
            destChainSelectors: onRampUpdates.destChainSelectors,
            onRamp: onRampUpdates.onRamp,
        });
    }
}

fun updateOffRamps(mutate st: Storage, offRampAdds: OffRamps?, offRampRemoves: OffRamps?) {
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
}

// Sends a CCIP receive confirmation to the OffRamp contract corresponding to
// the source chain. Triggered by the receiver after successful message
// handling. This operation is permissionless at the router level and the offramp will validate
// that this comes from a valid receiver
//
// sequenceDiagram
//     participant Receiver
//     participant Router
//     participant OffRamp
//     participant ReceiveExecutor

//     ReceiveExecutor ->> OffRamp:         OffRamp_DispatchValidated
//     OffRamp         ->> Router:          Router_RouteMessage
//     Router          ->> Receiver:        Receiver_CCIPReceive
//     Receiver        ->> Router:          Router_CCIPReceiveConfirm (process)
//     Router          ->> OffRamp:         OffRamp_CCIPReceiveConfirm
//     OffRamp         ->> ReceiveExecutor: ReceiveExecutor_Confirm
fun onCCIPReceiveConfirm(msg: Router_CCIPReceiveConfirm, sender: address) {
    val st = lazy Storage.load();
    val sourceChainSelector = msg.execId.getSourceChainSelector();

    val offRamp: address = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled as int);

    val confirmMsg = createMessage({
        bounce: true,
        value: 0, 
        dest: offRamp,
        body: OffRamp_CCIPReceiveConfirm {
            execId: msg.execId,
            receiver: sender,
        },
    });
    confirmMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Sends a CCIP receive confirmation to the OffRamp contract corresponding to
// the source chain. Triggered by the receiver after successful message
// handling. This operation is permissionless at the router level and the offramp will validate
// that this comes from a valid receiver
//
// sequenceDiagram
//     participant Receiver
//     participant Router
//     participant OffRamp
//     participant ReceiveExecutor

//     ReceiveExecutor ->> OffRamp:         OffRamp_DispatchValidated
//     OffRamp         ->> Router:          Router_RouteMessage
//     Router          ->> Receiver:        Receiver_CCIPReceive
//     Receiver        ->> Router:          Receiver_CCIPReceive (bounce, process)
//     Router          ->> OffRamp:         OffRamp_CCIPReceiveBounced
//     OffRamp         ->> ReceiveExecutor: ReceiveExecutor_Bounced
fun onCCIPReceiveBounced(execId: ReceiveExecutorId, sender: address) {
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

// Entrypoint to get a validated fee from the FeeQuoter.
//
// sequenceDiagram
//     participant SenderAcc
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     SenderAcc ->> Router:    Router_GetValidatedFee
//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidated
//     OnRamp    ->> Router:    OnRamp_MessageValidated
//     Router    ->> SenderAcc: Router_MessageValidated
fun onGetValidatedFee(msg: Router_GetValidatedFee<RemainingBitsAndRefs>, sender: address) {
    val st = lazy Storage.load();
    var ccipSendCell = msg.ccipSend;
    var ccipSend = lazy msg.ccipSend.load();
    val onRampResult = st.onRamps.get(ccipSend.destChainSelector);
    if (!onRampResult.isFound) {
        return sendMessageValidationFailed(sender, Router_Error.DestChainNotEnabled as uint256, msg.ccipSend, msg.context);
    }

    if (ccipSend.feeToken == null) {
        ccipSend.feeToken = st.wrappedNative;
        // to save on gas, we only update ccipSendCell if necessary
        ccipSendCell = ccipSend.toCell();
    }

    val feeQuoterMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRampResult.loadValue(),
        body: OnRamp_GetValidatedFee<Router_GetValidatedFeeContext> {
            ccipSend: ccipSendCell,
            context: Router_GetValidatedFeeContext {
                routerContext: sender,
                userContext: msg.context,
            },
        }
    });

    feeQuoterMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Handles a MessageValidated callback from the OnRamp contract.
// Only the onRamp can call this function.
//
// sequenceDiagram
//     participant SenderAcc
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     SenderAcc ->> Router:    Router_GetValidatedFee
//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidated
//     OnRamp    ->> Router:    OnRamp_MessageValidated (process msg)
//     Router    ->> SenderAcc: Router_MessageValidated
fun onMessageValidatedFromOnRamp(msg: OnRamp_MessageValidated<Router_GetValidatedFeeContext>) {
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

// Handles a MessageValidationFailed callback from the OnRamp contract.
// Only the onRamp can call this function.
//
// sequenceDiagram
//     participant SenderAcc
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     SenderAcc ->> Router:    Router_GetValidatedFee
//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidationFailed
//     OnRamp    ->> Router:    OnRamp_MessageValidationFailed (process msg)
//     Router    ->> SenderAcc: Router_MessageValidationFailed
fun onMessageValidationFailedFromOnRamp(msg: OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext>) {
    val userAddress = msg.context.routerContext;
    sendMessageValidationFailed(userAddress, msg.error, msg.msg, msg.context.userContext);
}

fun sendMessageValidationFailed(userAddress: address, error: uint256, msg: Cell<Router_CCIPSend>, userContext: RemainingBitsOrRef<RemainingBitsAndRefs>) {
    val replyMsg = createMessage({
        bounce: true,
        value: 0,
        dest: userAddress,
        body: Router_MessageValidationFailed {
            error: error,
            msg: msg,
            context: userContext,
        }
    });
    replyMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/*
CCIP entrypoint to send a message
 */
fun onCCIPSend(msg: Router_CCIPSend, sender: address, value: coins) {
    val st = lazy Storage.load();

    // verify destination chain not cursed
    var rmn = st.rmnRemote.load();
    val isCursed = rmn.cursedSubjects.isCursed(msg.destChainSelector as uint128);
    assert(!isCursed, Router_Error.SubjectCursed);

    if (msg.feeToken == null) {
        msg.feeToken = st.wrappedNative
    }

    val onRampResult = st.onRamps.get(msg.destChainSelector);
    if (!onRampResult.isFound) {
        return sendMessageRejected(sender, msg.queryID, Router_Error.DestChainNotEnabled as uint256);
    }
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRampResult.loadValue(),
        body: OnRamp_Send { msg: msg.toCell(), metadata: Metadata{ sender, value } },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/*
Handles RMNRemote curse operations by adding specified cursed subjects
and propagating updates to cached OffRamp contracts.
*/
fun onRMNRemoteCurse(st: Storage, rmn: RMNRemote, msg: Router_RMNRemoteCurse) {
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

/*
Handles RMNRemote uncurse operations by removing specified cursed subjects
and propagating updates to cached OffRamp contracts.
*/
fun onRMNRemoteUncurse(st: Storage, rmn: RMNRemote, msg: Router_RMNRemoteUncurse) {
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

// Sends an ack to the CCIP sender once it finishes successfully.
// Only the OnRamp can call this function.
//
// sequenceDiagram
//     participant SenderAcc
//     participant Router
//     participant OnRamp
//     participant CCIPSendExecutor

//     CCIPSendExecutor ->> OnRamp:    OnRamp_ExecutorFinishedSuccessfully
//     OnRamp           ->> Router:    Router_MessageSent
//     Router           ->> SenderAcc: Router_CCIPSendACK
fun onSendACK(msg: Router_MessageSent) {
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

// Sends an nack to the CCIP sender once it finishes with an error.
// Only the OnRamp can call this function.
//
// sequenceDiagram
//     participant SenderAcc
//     participant Router
//     participant OnRamp
//     participant CCIPSendExecutor

//     CCIPSendExecutor ->> OnRamp:    OnRamp_ExecutorFinishedWithError
//     OnRamp           ->> Router:    Router_MessageRejected
//     Router           ->> SenderAcc: Router_CCIPSendNACK
fun onSendNACK(msg: Router_MessageRejected) {
    sendMessageRejected(msg.sender, msg.queryID, msg.error);
}

fun sendMessageRejected(sender: address, queryID: uint64, error: uint256) {
    val nackMsg = createMessage({
        bounce: true,
        value: 0,
        dest: sender,
        body: Router_CCIPSendNACK {
            queryID: queryID,
            error: error,
        }
    });

    nackMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/*
Handles contract upgrade requests using the Upgradeable pattern. Invokes the
upgrade process with the current migrate function and version metadata.
*/
fun onUpgrade(msg: Upgradeable_Upgrade) {
    Upgradeable{ migrate, version }.upgrade(msg);
}

/*
Verifies that the caller corresponds to the onramp associated with the given chain selector
*/
fun assertSenderIsOnRamp(st: Storage, destChainSelector: uint64, sender: address) {
    val onRampAddress = st.onRamps.mustGet(destChainSelector, Router_Error.DestChainNotEnabled as int);
    assert (sender == onRampAddress) throw Router_Error.NotOnRamp;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun verifyNotCursed(subject: uint128): bool {
    val st = lazy Storage.load();
    var rmn = st.rmnRemote.load();
    return !rmn.cursedSubjects.isCursed(subject);
}

get fun cursedSubjects(): tuple? {
    val st = lazy Storage.load();
    var rmn = st.rmnRemote.load();
    return keysLispList(rmn.cursedSubjects.data)!;
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

/// Gets the current owner of the contract.
get fun rmn_owner(): address {
    val st: Storage = lazy Storage.load();
    return st.rmnRemote.load().admin.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun rmn_pendingOwner(): address? {
    val st = lazy Storage.load();
    return st.rmnRemote.load().admin.get_pendingOwner();
}

get fun typeAndVersion(): (slice, slice) {
    return (Router_FACILITY_NAME, CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return Router_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.ccip.Router"), local);
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
