// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"
import "../offramp/messages"
import "../offramp/types"
import "messages"
import "errors"
import "storage"
import "types"

tolk 1.4.2

// MerkleRoot contract
// Root is commited on Commit Reports and the existence of this contract is used to validate Execute Reports

const CONTRACT_VERSION = "1.7.0".literalSlice();

contract MerkleRoot {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.7.0"
    description: "link.chain.ton.ccip.MerkleRoot"

    storage: MerkleRoot_Storage
    incomingMessages: MerkleRoot_InMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be the owner (OffRamp)
        MerkleRoot_Validate => {
            var st = lazy MerkleRoot_Storage.load();
            assert (in.senderAddress == st.owner) throw (MerkleRoot_Error.NotOwner);
            onInitExecute(mutate st, msg);
            st.store();

        }
        // Sender must be the owner (OffRamp)
        MerkleRoot_MarkState => {
            var st = lazy MerkleRoot_Storage.load();
            assert (in.senderAddress == st.owner) throw (MerkleRoot_Error.NotOwner);
            onMarkState(mutate st, msg);
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw (0xFFFF)
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    assert (in.bouncedBody.preloadUint(32) == 0xfffffffe) throw (MerkleRoot_Error.UnhandledLegacyBounce);
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val bounced = lazy MerkleRoot_BouncedMessage.fromCell(rich.originalBody);
    var st = lazy MerkleRoot_Storage.load();
    match (bounced) {
        OffRamp_ExecuteValidated => {
            onExecuteValidatedBounced(mutate st, bounced);
        }
    }
    st.store();
}

/// The OffRamp rejected the validated message, so no ReceiveExecutor was started. Marks it
/// Failure instead of leaving it InProgress, so it can be manually executed again. Nothing else
/// moves the message off InProgress before the OffRamp answers, so any other state is a bug.
fun onExecuteValidatedBounced(mutate st: MerkleRoot_Storage, msg: OffRamp_ExecuteValidated) {
    val message = lazy msg.message.load();
    val seqNum = message.header.sequenceNumber;
    assert (st.getMessageState(seqNum) == ExecutionState.InProgress) throw (MerkleRoot_Error.InvalidState);
    st.setMessageState(seqNum, ExecutionState.Failure);
}

/*
Marks the execution state of a message in a MerkleRoot contract.
Ensures valid state transitions, returns the excesses carried by the message to the OffRamp
(which refunds the execution caller), and finalizes the root once all messages are delivered by
sending remaining balance back to the OffRamp owner.
*/
fun onMarkState(mutate st: MerkleRoot_Storage, msg: MerkleRoot_MarkState) {
    // validate we're transitioning states correctly: success is final
    val previousState= st.getMessageState(msg.seqNum);

    assert (previousState != ExecutionState.Success) throw (MerkleRoot_Error.InvalidState);
    assert (msg.state == ExecutionState.Success || msg.state == ExecutionState.Failure) throw (MerkleRoot_Error.InvalidState);

    st.setMessageState(msg.seqNum, msg.state);

    if (msg.state == ExecutionState.Success) {
        st.deliveredMessageCount += 1;
    }

    // Return the excesses carried by this message (inbound value minus this transaction's fees)
    // to the OffRamp, which refunds them to the execution caller.
    val excesses = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: st.owner,
        body: OffRamp_ReturnExecuteExcess {
            root: st.root,
            excessesTo: msg.excessesTo,
        },
    });
    excesses.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    if (st.deliveredMessageCount == st.expectedMessages()) {
        // If this is the last message from the root we return the rest of the balance to the
        // OffRamp and freeze the contract. This is the root's own balance (funded by the commit),
        // not the caller's: the caller's excesses were already returned above.
        val freezeRoot = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: st.owner,
            body: createEmptyCell()
        });
        freezeRoot.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
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
    assert (state == ExecutionState.Failure || state == ExecutionState.Untouched) throw (MerkleRoot_Error.SkippedAlreadyExecutedMessage);

    val isManualExecute = msg.gasOverride != null;

    if (isManualExecute) {
        val isOldCommitReport = (blockchain.now() - st.timestamp > msg.permissionlessExecutionThresholdSeconds);
        // Manual execution is fine if we previously failed or if the commit report is just too old.
        // (In that case the report will still be in UNTOUCHED state)
        assert (isOldCommitReport || state == ExecutionState.Failure) throw (MerkleRoot_Error.ManualExecutionNotYetEnabled);
    } else {
        // DON can only execute a message once.
        assert (state == ExecutionState.Untouched) throw (MerkleRoot_Error.AlreadyExecuted);
    }

    st.setMessageState(message.header.sequenceNumber, ExecutionState.InProgress);

    val executeValidated = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.owner,
        body: OffRamp_ExecuteValidated {
            queryID: msg.queryID,
            message: message.toCell(),
            root: st.root,
            metadataHash: msg.metadataHash,
            gasOverride: msg.gasOverride,
            executionState: state,
            offchainTokenData: msg.offchainTokenData,
            excessesTo: msg.excessesTo,
        }
    });
    executeValidated.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

get fun typeAndVersion(): (slice, slice) {
    return (MerkleRoot_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return MerkleRoot_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(MerkleRoot_FACILITY_NAME.crc32(), local);
}
