// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../../lib/funding/withdrawable.tolk"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../rmn_remote/lib.tolk"

import "../onramp/messages"
import "../onramp/types"
import "../offramp/messages"
import "../offramp/types"
import "../common/messages"
import "../test/tokenPool/messages"

import "types"
import "messages"
import "storage"
import "errors"
import "events"
import "../../lib/deployable/namespace"
import "../token_registry/storage"
import "../token_registry/messages"
import "../../lib/deployable/types"

tolk 1.4.1

const CONTRACT_VERSION = "1.6.1".literalSlice();
const RESERVE = ton("1");

contract Router {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.Router"

    storage: Storage
    incomingMessages: Router_InMsg
    forceAbiExport: (Router_MessageValidationFailed_RemainingBitsAndRefs, Router_MessageValidated_RemainingBitsAndRefs)
}

fun requireSupportedVersion(version: slice) {
    assert (version.bitsEqual("1.6.0".literalSlice())) throw Upgradeable_Error.VersionMismatch;
}

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
            // Token transfer messages can only come in through jetton transfer notifications
            assert(msg.tokenAmounts.empty()) throw Router_Error.TokenTransferNotThroughNotification; //TBD shuold this be sendMessageRejected instead of throw?
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
            val expectedOffRamp = st.offRamps.mustGet(message.sourceChainSelector, Router_Error.SourceChainNotEnabled);
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
            val st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg);
        }
        // Sender must be owner
        Upgradeable_Upgrade => {
            val st = lazy Storage.load();
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
        Router_LockOrBurn => {
            val st = lazy Storage.load();
            assertSenderIsOnRamp(st, msg.destChainSelector, in.senderAddress);
            onLockOrBurn(msg);
        }
        // Sender must be a Jetton Wallet owned by the Router
        Common_JettonTransferNotification => {
            // TODO we can't just throw errors in the Router on JettonTransferNotification - this will burn the tokens.
            // - We either need to return them (do we have enough gas to return?)
            // - Or we need to store state and mark them invalid to be able to withdraw
            // - Or we need a per-user deposit account which would do the checks and allow the user to withdraw
            // Issue with returning/notifying is that we could fail down the line on any contract involved.
            // Trying to catch every single error to notify failure could be very hard so a deposit account that always allows withdrawals
            // could be the best solutuion. As long as we are able to guarantee we won't consume already withdrawn tokens

            // TODO minValue is probably higher for a tokenTransfer as it needs more hops.
            // We should revisit our entire min gas assertion model anyway
            val minValue = Router_Costs.CCIPSend();
            assert (in.valueCoins >= minValue) throw Router_Error.InsufficientFee;

            assert (msg.forwardPayload != null) throw Router_Error.JettonTransferNotificationWithoutForwardPayload;

            //TODO: should we catch cases when the forward payload is not Router_CCIPSend?
            val sendMsg = lazy Router_CCIPSend.fromCell(msg.forwardPayload);

            var tokenAmounts = sendMsg.tokenAmounts.iter();
            assert (!tokenAmounts.empty()) throw Router_Error.MissingTokenAmounts;

            val transferedJetton = tokenAmounts.next();
            assert (transferedJetton.amount == msg.amount) throw Router_Error.TokenAmountMismatch;
            assert (tokenAmounts.empty()) throw Router_Error.NoMultiTokenTransfers;

            onCCIPSend(sendMsg, msg.sender, in.valueCoins);
        }
        Router_TokenRegistrySetTokenInfo => {
            val st = Storage.load();
            val registryAddress = getTokenRegistryDeployAddress(st, msg.tokenAddress);
            if (msg.isNewEntry) {
                val deployMsg = createMessage({
                    bounce: false,
                    value: ton("0.015"),
                    dest: registryAddress,
                    body: Deployable_Initialize {
                        stateInit: {
                            code: st.tokenRegistryDeployment.load().tokenRegistryCode,
                            data: TokenRegistry_Storage {
                                tokenAddress: msg.tokenAddress,
                                tokenInfo: msg.tokenInfo
                            }.toCell(),
                        }
                    },
                });
                deployMsg.send(SEND_MODE_REGULAR);
            }
            val setTokenInfoMsg = createMessage({
                bounce: false,
                value: ton("0.015"),
                dest: registryAddress,
                body: TokenRegistry_SetTokenInfo {
                    info: msg.tokenInfo
                }
            });
            setTokenInfoMsg.send(SEND_MODE_REGULAR); //TODO check send_mode
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
            val existing = st.offRamps.mustGet(selector, Router_Error.OffRampNotSetForSelector);
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

    val offRamp: address = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled);

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
    val offRamp = st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled);

    val receiveBounced = createMessage({
        bounce: true,
        value: OffRamp_Costs.receiveConfirmOrDeny(),
        dest: offRamp,
        body: OffRamp_CCIPReceiveBounced {
            execId,
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

fun sendMessageValidationFailed(userAddress: address, error: uint256, msg: Cell<Router_CCIPSend>, userContext: RemainingBitsAndRefs) {
    val replyMsg = createMessage({
        bounce: true,
        value: 0,
        dest: userAddress,
        body: Router_MessageValidationFailed {
            error,
            msg,
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

    // Calculate the token registry address if there is a token amount.
    // If the token does not exist then the call to get token info will bounce from the ramps.
    var tokenRegistry: address? = null;
    if (!msg.tokenAmounts.empty()) {
        val tokenAmount = msg.tokenAmounts.iter().next(); // Only one tokenAmount per msg is supported
        //TODO should we assert that there is only one token in the tokenAmounts? Or do we just ignore after the first one?
        tokenRegistry = getTokenRegistryDeployAddress(st, tokenAmount.token).calculateAddress();
    }

    val onRampResult = st.onRamps.get(msg.destChainSelector);
    if (!onRampResult.isFound) {
        return sendMessageRejected(sender, msg.queryID, Router_Error.DestChainNotEnabled as uint256);
    }
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRampResult.loadValue(),
        body: OnRamp_Send { msg: msg.toCell(), metadata: Metadata{ sender, value }, tokenRegistry},
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
                subject,
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
                subject,
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
            queryID,
            error,
        }
    });

    nackMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

//TODO: Sending LockOrBurn to the TokenPool should trigger a withdraw pattern to get the tokens to the TP
/*
The thing is at this point we still didn't go through all the preflight checks - (1) gas check for TP processing - unique per TP/Jetton, (2) rate limiter check, (3) advanced hooks check

We don't want to move funds then return if any of those fail, but ideally we do all the checks and withdraw funds sequentially.
*/
/*
withdraw path should go through the executor - so the TP needs to withdraw -> executor, which can verify the token amounts and will withdraw -> on-ramp, which can verify the executor. Finally the on-ramp withdraws from the Router - the TP accepts only transfers from the Router JettonWallet.
*/
fun onLockOrBurn(msg: Router_LockOrBurn) {
    val tokenPoolLockOrBurn = createMessage({
        bounce: true,
        value: 0,
        dest: msg.tokenPool,
        body: MockTokenPool_LockOrBurn {
            tokenAmount: msg.tokenAmount,
            notify: msg.executorAddress,
        }
    });
    tokenPoolLockOrBurn.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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
    val onRampAddress = st.onRamps.mustGet(destChainSelector, Router_Error.DestChainNotEnabled);
    assert (sender == onRampAddress) throw Router_Error.NotOnRamp;
}

/*
Derives the token registry contract address from the token address
*/
fun getTokenRegistryDeployAddress(st: Storage, tokenAddress: address): AutoDeployAddress {
    return {
        stateInit: {
            code: st.tokenRegistryDeployment.load().deployableCode,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_TokenRegistry,
                owner: contract.getAddress(),
                id: tokenAddress,
            }),
        }
    }
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    requireSupportedVersion(version);
    return storage;
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun verifyNotCursed(subject: uint128): bool {
    val st = lazy Storage.load();
    var rmn = st.rmnRemote.load();
    return !rmn.cursedSubjects.isCursed(subject);
}

get fun cursedSubjects(): lisp_list<uint128> {
    val st = lazy Storage.load();
    val rmn = st.rmnRemote.load();
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
    return (Router_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return Router_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(Router_FACILITY_NAME.crc32(), local);
}

get fun onRamp(destChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.onRamps.mustGet(destChainSelector, Router_Error.DestChainNotEnabled);
}

get fun offRamp(sourceChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.offRamps.mustGet(sourceChainSelector, Router_Error.SourceChainNotEnabled);
}

struct Ramp {
    chainSelector: uint64
    ramp: address
}

/// TODO returns lisp_list<OnRamp>
get fun onRamps(): lisp_list<Cell<Ramp>> {
    val st = lazy Storage.load();
    var onRamps: lisp_list<Cell<Ramp>> = [];
    var r = st.onRamps.findFirst();
    while (r.isFound) {
        val ramp = Ramp {
            chainSelector: r.getKey(),
            ramp: r.loadValue(),
        };
        onRamps.prependHead(ramp.toCell());
        r = st.onRamps.iterateNext(r);
    }
    return onRamps;
}

/// TODO returns lisp_list<OffRamp>
get fun offRamps(): lisp_list<Cell<Ramp>> {
    val st = lazy Storage.load();
    var offRamps: lisp_list<Cell<Ramp>> = [];
    var r = st.offRamps.findFirst();
    while (r.isFound) {
        val ramp = Ramp {
            chainSelector: r.getKey(),
            ramp: r.loadValue(),
        };
        offRamps.prependHead(ramp.toCell());
        r = st.offRamps.iterateNext(r);
    }
    return offRamps;
}

get fun destChainSelectors(): lisp_list<uint64> {
    val st = lazy Storage.load();
    val d = st.onRamps;
    return keysLispList(d)!;
}

get fun reserve(): coins {
    return RESERVE;
}
