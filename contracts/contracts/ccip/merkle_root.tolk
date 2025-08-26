import "types.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../deployable/types.tolk";
import "../lib/utils.tolk";

// State stores the general state machine indicating which phase we're in
// TODO: we might be able to merge this into execution_states
const STATE_UNTOUCHED: uint8 = 0;
const STATE_TOKEN_TRANSFER: uint8 = 1;
const STATE_EXECUTE: uint8 = 2;
const STATE_SUCCESS: uint8 = 3;

// Execution state stores CCIP specfic information
// These have to match the EVM states
const EXECUTION_STATE_UNTOUCHED: uint8 = 0;
const EXECUTION_STATE_IN_PROGRESS: uint8 = 1;
const EXECUTION_STATE_SUCCESS: uint8 = 2;
const EXECUTION_STATE_FAILURE: uint8 = 3;
// TODO: we need to fit additional states: TOKEN_TRANSFER | EXECUTE

const ERROR_STATE_IS_NOT_UNTOUCHED: uint32 = 0x7878;

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}


type MerkleRoot_InMessage = MerkleRoot_Validate;

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        MerkleRoot_Validate => {
            // If we receive this message from the OffRamp then the merkle proof has already been validated.
            _validateAndExecute(msg, in.senderAddress);
            
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

//TODO: We are not keeping track of the execution state right now, we just relay the message to confirm that the merkle proof is valid

fun _validateAndExecute(msg: MerkleRoot_Validate, sender: address) {
    val st = MerkleRoot_Storage.load();
    assert(sender == st.owner, ERROR_NOT_OWNER);

    assert(st.state == EXECUTION_STATE_UNTOUCHED, ERROR_STATE_IS_NOT_UNTOUCHED);
    // TODO if no tokenTransfers
    _execute(st, msg.messages, msg.proofs, msg.proofFlagBits, msg.metadataHash, sender);

    // if tokenTransfers 
    // validate execution state == untouched
    // if initial
    //  allocate storage space for the execution report
    // TODO: should we fan out CommitReport into individual executions?
    // 
    // if in progress
    // if tokenAmounts > 0 && state == initial
    // set state = token transfer
    // send message to offramp to ask to release tokens
    // else if no tokenTransfers
    // set state = execution
}

fun _execute(st: MerkleRoot_Storage, mesages: cell, proofs: cell, proofFlagBits: uint256, metadataHash: uint256, offRamp: address) {
    st.state = STATE_SUCCESS;
    st.store();
    createMessage(
        {
            bounce: true,
            value: ton("0"),
            dest: offRamp,
            body: OffRamp_DispatchValidated {
                messages: mesages,
                proofs: proofs,
                proofFlagBits: proofFlagBits,
                metadataHash: metadataHash
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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
