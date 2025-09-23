import "types.tolk";
import "messages.tolk";
import "exit_codes.tolk";
import "storage";
import "../../lib/upgrades/type_and_version.tolk";
import "../../deployable/types.tolk";
import "../../lib/utils.tolk";

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        MerkleRoot_Validate => {
            // If we receive this message from the OffRamp then the merkle proof has already been validated.
            _validateAndExecute(msg, in.senderAddress);
        }
        MerkleRoot_CCIPReceiveConfirm => {
            _ccipReceiveConfirm(msg, in.senderAddress);
        }
        MerkleRoot_CCIPReceiveBounced => {
            _ccipReceiveBounced(msg, in.senderAddress);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}
fun _ccipReceiveBounced(msg: MerkleRoot_CCIPReceiveBounced, sender: address){
    var st = MerkleRoot_Storage.load();

    assert(sender == st.owner, Error.NotOwner);
    assert(st.state == State.Execute && st.message != null, Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = st.message!.load();

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = State.ExecuteFailed;
    st.store();

    val messageHeader = ccipMessage.header;
    val offRampNotifyFailure = createMessage({
        bounce: true,
        value: ton("0"),
        dest: st.owner,
        body: OffRamp_NotifyFailure {
            header: messageHeader,
            rootId: st.rootId,
        },
    });
    offRampNotifyFailure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

}

fun _ccipReceiveConfirm(msg: MerkleRoot_CCIPReceiveConfirm, sender: address) {
    var st = MerkleRoot_Storage.load();

    assert(st.state == State.Execute && st.message != null, Error.UpdatingStateOfNonExecutedMessage);
    assert(sender == st.owner, Error.NotOwner);

    val ccipMessage = st.message!.load();

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = State.Success;
    st.store();

    val messageHeader = ccipMessage.header;
    val offRampNotifySuccess = createMessage({
        bounce: true,
        value: ton("0"),
        dest: st.owner,
        body: OffRamp_NotifySuccess {
            header: messageHeader,
            rootId: st.rootId
        },
    });
    offRampNotifySuccess.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun _validateAndExecute(msg: MerkleRoot_Validate, sender: address) {
    var st = MerkleRoot_Storage.load();

    assert(sender == st.owner, Error.NotOwner);
    assert(st.state == State.Untouched, Error.StateIsNotUntouched);

    val ccipMessage = msg.message;

    st.message = ccipMessage.toCell();
    st.store();

    //TODO 
    // if tokenAmounts > 0 && state == initial
    // val notifyInProgress = createMessage({
    //     bounce: true,
    //     value: ton("0.05"),
    //     dest: st.owner,
    //     body: OffRamp_NotifyInProgress {
    //         st.messages, msg.proofs, msg.proofFlagBits, msg.metadataHash
    //     }
    // });
    // notifyInProgress.send(SEND_MODE_REGULAR);
    // set state = token transfer
    // send message to offramp to ask to release tokens

    // else if no tokenTransfers
    _execute(st, ccipMessage);
}

fun _execute(st: MerkleRoot_Storage, mesage: Any2TVMRampMessage) {
    st.state = State.Execute;
    st.store();
    createMessage(
        {
            bounce: true,
            value: ton("0.05"),
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: mesage.toCell(),
                rootId: st.rootId,
            }
        }
    ).send(SEND_MODE_REGULAR);
}


// TODO: should we wait for all transfers to either complete or fail before we allow retry?

// fun onExcesses() {
    // if state == token_transfer
    // track token transfer amounts per tokenAmount in report
    //
    // TODO: what if offramp->tokenPool bounces
    //
    // if all transfers complete
    // set state = execution
    // call execute
// }

// fun _execute() {
    // notify offramp to call receiver with payload    
    // store a callback address (this commit report)
    //
    // TODO: we could execute directly from commit report but it'd require the receiver
    // to validate the commit report address at runtime rather than router that can be hardcoded
// }

// fun onExecutionNotification() {
    // lookup execution report
    // validate sender is actually the receiver of the execution
    // validate state is actually set to execute
// }

// IDEA: we could incentivise receivers to call back on success by sharing the rent refund

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.MerkleRoot", "1.0.0");
 }
