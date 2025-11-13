import "messages"
import "errors"
import "storage"
import "../offramp/messages"
import "../offramp/types"
import "../../lib/utils"
import "../../deployable/types.tolk"
import "../receive_executor/storage"
import "../../lib/funding/withdrawable"

// MerkleRoot contract
// Root is commited on Commit Reports and the existence of this contract is used to validate Execute Reports

const CONTRACT_VERSION = "0.0.9";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be OffRamp
        MerkleRoot_Validate => {
            // If we receive this message from the OffRamp then the merkle proof has already been validated
            // and we know the message is part of the Commit Report. 
            _initExecute(msg, in.senderAddress);
        }
        MerkleRoot_MarkState => {
            _markState(msg, in.senderAddress);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun _markState(msg: MerkleRoot_MarkState, sender: address) {
    var st = MerkleRoot_Storage.load();

    // only offramp owned message is allowed
    assert(sender == st.owner, MerkleRoot_Error.NotOwner);

    // TODO: manually executing an inProgress message if the receiver doesn't correctly ack the message can be problematic

    // validate we're transitioning states correctly: success is final
    val previousState= st.getMessageState(msg.seqNum);
    assert(previousState != ExecutionState.Success, MerkleRoot_Error.InvalidState);
    st.setMessageState(msg.seqNum, msg.state);

    if (msg.state == ExecutionState.Success) {
        st.deliveredMessageCount += 1;
    }
    st.store();
    
    if (st.deliveredMessageCount == st.expectedMessages()) {
        // if this is the last message from the root we return all the balance to the OffRamp and freeze the contract
        val freezeRoot = createMessage({
            bounce: true,
            value: ton("0"),
            dest: st.owner,
            body: createEmptyCell()
        });
        freezeRoot.send(SEND_MODE_CARRY_ALL_BALANCE);
    }
}

// Responds to the OffRamp to validate existance of the message in the Execute report.
// This triggers OffRamp deployment of the ReceiveExecutor contract that handles execution state for the message
fun _initExecute(msg: MerkleRoot_Validate, sender: address) {
    var st = MerkleRoot_Storage.load();

    assert(sender == st.owner, MerkleRoot_Error.NotOwner);
    val message = lazy msg.message.load();
    val state = st.getMessageState(message.header.sequenceNumber);
    assert(state == ExecutionState.Failure || state == ExecutionState.Untouched, MerkleRoot_Error.SkippedAlreadyExecutedMessage);

    val isManualExecute = msg.gasOverride != null;

    if (isManualExecute) {
        val isOldCommitReport = (blockchain.now() - st.timestamp > msg.permissionlessExecutionThresholdSeconds);
        // Manual execution is fine if we previously failed or if the commit report is just too old.
        // (In that case the report will still be in UNTOUCHED state)
        assert(isOldCommitReport || state == ExecutionState.Failure, MerkleRoot_Error.ManualExecutionNotYetEnabled);
    } else {
        // DON can only execute a message once.
        assert(state == ExecutionState.Untouched, MerkleRoot_Error.AlreadyExecuted);
    }

    st.setMessageState(message.header.sequenceNumber, ExecutionState.InProgress);
    st.store();

    val executeValidated = createMessage({
        bounce: true,
        value: ton("0.02"),
        dest: st.owner,
        body: OffRamp_ExecuteValidated {
            message: message.toCell(),
            root: st.root,
            metadataHash: msg.metadataHash,
            gasOverride: msg.gasOverride,
            executionState: state,
        }
    });
    executeValidated.send(SEND_MODE_REGULAR);
}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.MerkleRoot", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.MerkleRoot"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.MerkleRoot"), local);
}
