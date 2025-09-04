import "types.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../deployable/types.tolk";
import "../lib/utils.tolk";

// State stores the general state machine indicating which phase we're in
// TODO: we might be able to merge this into execution_states
const STATE_UNTOUCHED: uint8 = 0;
const STATE_TOKEN_TRANSFER: uint8 = 1;
const STATE_EXECUTE: uint8 = 2;
const STATE_EXECUTE_FAILED: uint8 =3;
const STATE_SUCCESS: uint8 = 4;

// TODO: we need to fit additional states: TOKEN_TRANSFER | EXECUTE

const ERROR_STATE_IS_NOT_UNTOUCHED = 300;
const ERROR_CONFIRMING_NON_EXECUTED_MESSAGE = 301;
const ERROR_FAILING_NON_EXECUTED_MESSAGE = 302;
const ERROR_NOT_OWNER = 303;

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

type MerkleRoot_InMessage = MerkleRoot_Validate | MerkleRoot_CCIPReceiveBounced | MerkleRoot_CCIPReceiveConfirm;

fun onInternalMessage(in: InMessage) {
    val msg = lazy MerkleRoot_InMessage.fromSlice(in.body);
    match (msg) {
        MerkleRoot_Validate => {
            // If we receive this message from the OffRamp then the merkle proof has already been validated.
            _validateAndExecute(msg, in.senderAddress);
        }
        MerkleRoot_CCIPReceiveConfirm => {
            var st = MerkleRoot_Storage.load();

            assert(st.state == STATE_EXECUTE && st.message != null, ERROR_CONFIRMING_NON_EXECUTED_MESSAGE);
            assert(in.senderAddress == st.owner, ERROR_NOT_OWNER);

            val ccipMessage = msg.message!.load();

            assert (msg.receiver == ccipMessage.receiver, ERROR_CONFIRM_FROM_INVALID_RECEIVER);

            st.state = STATE_SUCCESS;
            st.store();

            val messageHeader = ccipMessage!.load().header;
            val offRampNotifySuccess = createMessage({
                bounce: true,
                value: ton("0"),
                dest: st.owner,
                body: OffRamp_NotifySuccess {
                    header: messageHeader,
                },
            });
            offRampNotifySuccess.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        MerkleRoot_CCIPReceiveBounced => {
            var st = MerkleRoot_Storage.load();
            assert(in.senderAddress == st.owner, ERROR_NOT_OWNER);
            assert(msg.receiver == st.

            st.state = STATE_EXECUTE_FAILED;
            st.store();

            val messageHeader = st.message!.load().header;
            val offRampNotifyFailure = createMessage({
                bounce: true,
                value: ton("0"),
                dest: st.owner,
                body: OffRamp_NotifyFailure {
                    header: messageHeader
                },
            });
            offRampNotifyFailure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

//TODO: We are not keeping track of the execution state right now, we just relay the message to confirm that the merkle proof is valid

fun _validateAndExecute(msg: MerkleRoot_Validate, sender: address) {
    var st = MerkleRoot_Storage.load();

    assert(sender == st.owner, ERROR_NOT_OWNER);
    assert(st.state == STATE_UNTOUCHED, ERROR_STATE_IS_NOT_UNTOUCHED);

    val message = msg.message.load();
    st.message = message.toCell();
    st.store();

    //TODO 
    // if tokenAmounts > 0 && state == initial
    // val notifyInProgress = createMessage({
    //     bounce: true,
    //     value: ton("0.05"),
    //     dest: st.owner,
    //     body: OffRamp_NotifyInProgress {
    //         msg.messages, msg.proofs, msg.proofFlagBits, msg.metadataHash
    //     }
    // });
    // notifyInProgress.send(SEND_MODE_REGULAR);
    // set state = token transfer
    // send message to offramp to ask to release tokens

    // else if no tokenTransfers
    _execute(st, message, msg.root);
}

fun _execute(st: MerkleRoot_Storage, mesage: Any2TVMRampMessage, root: uint256) {
    st.state = STATE_EXECUTE;
    st.store();
    createMessage(
        {
            bounce: true,
            value: ton("0.05"),
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: mesage.toCell(),
                root: root,
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
