// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "errors"
import "storage"
import "../offramp/messages"
import "../offramp/types"
import "../../lib/utils"
import "../../deployable/types.tolk"
import "../receive_executor/storage"
import "../router/storage"
import "../../lib/funding/withdrawable"
import "types"

// MerkleRoot contract
// Root is commited on Commit Reports and the existence of this contract is used to validate Execute Reports

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be the owner (OffRamp)
        MerkleRoot_Validate => {
            var st = lazy MerkleRoot_Storage.load();
            assert(in.senderAddress == st.owner, MerkleRoot_Error.NotOwner);
            onInitExecute(mutate st, msg);
            st.store();

        }
        // Sender must be the owner (OffRamp)
        MerkleRoot_MarkState => {
            var st = lazy MerkleRoot_Storage.load();
            assert(in.senderAddress == st.owner, MerkleRoot_Error.NotOwner);
            onMarkState(mutate st, msg);
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

/*
Marks the execution state of a message in a MerkleRoot contract.
Ensures valid state transitions and finalizes the root once all messages are
delivered by sending remaining balance back to the OffRamp owner.
*/
fun onMarkState(mutate st: MerkleRoot_Storage, msg: MerkleRoot_MarkState) {
    // validate we're transitioning states correctly: success is final
    val previousState= st.getMessageState(msg.seqNum);

    assert(previousState != ExecutionState.Success, MerkleRoot_Error.InvalidState);
    assert(msg.state == ExecutionState.Success || msg.state == ExecutionState.Failure, MerkleRoot_Error.InvalidState);

    st.setMessageState(msg.seqNum, msg.state);

    if (msg.state == ExecutionState.Success) {
        st.deliveredMessageCount += 1;
    }

    if (st.deliveredMessageCount == st.expectedMessages()) {
        // if this is the last message from the root we return all the balance to the OffRamp and freeze the contract
        val freezeRoot = createMessage({
            bounce: true,
            value: 0,
            dest: st.owner,
            body: createEmptyCell()
        });
        freezeRoot.send(SEND_MODE_CARRY_ALL_BALANCE);
    }
}

/*
If we receive this message from the OffRamp then the merkle proof has already been validated
and we know the message is part of the Commit Report.

Responds to the OffRamp to validate existence of the message in the Execute report.
This triggers OffRamp deployment of the ReceiveExecutor contract that handles execution state for the message
*/
fun onInitExecute(mutate st: MerkleRoot_Storage, msg: MerkleRoot_Validate) {
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

    val executeValidated = createMessage({
        bounce: true,
        value: 0,
        dest: st.owner,
        body: OffRamp_ExecuteValidated {
            message: message.toCell(),
            root: st.root,
            metadataHash: msg.metadataHash,
            gasOverride: msg.gasOverride,
            executionState: state,
        }
    });
    executeValidated.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

get fun typeAndVersion(): (slice, slice) {
    return (MerkleRoot_FACILITY_NAME, CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return MerkleRoot_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.MerkleRoot"), local);
}
