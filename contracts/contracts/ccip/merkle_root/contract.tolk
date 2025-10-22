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
// Root is commited on Commit Reports and the existance of this contract is used to validate Execute Reports

const CONTRACT_VERSION = "0.0.5";
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
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// Responds to the OffRamp to validate existance of the message in the Execute report.
// This triggers OffRamp deployment of the ReceiveExecutor contract that handles execution state for the message
fun _initExecute(msg: MerkleRoot_Validate, sender: address) {
    var st = MerkleRoot_Storage.load();

    assert(sender == st.owner, Error.NotOwner);
    val ccipMessage = msg.message.load();

    assert(!st.validatedMessages.exists(ccipMessage.header.messageId)) throw Error.AlreadyExecuted;

    st.validatedMessages.set(ccipMessage.header.messageId, true);
    st.validatedMessageCount += 1;
    st.store();

    if (st.validatedMessageCount < st.expectedMessages) {
        val executeValidated = createMessage({
            bounce: true,
            value: ton("0.02"),
            dest: st.owner,
            body: OffRamp_ExecuteValidated {
                message: ccipMessage.toCell(),
                root: st.root,
                metadataHash: msg.metadataHash
            }
        });
        executeValidated.send(SEND_MODE_REGULAR);
    } else {
        // If this is the last message from the root we return all the balance to the OffRamp and freeze the contract
        // The MerkleRoot is not required anymore, manual exec goes directly through the ReceiveExecutor 
        val executeValidated = createMessage({
            bounce: true,
            value: ton("0"),
            dest: st.owner,
            body: OffRamp_ExecuteValidated {
                message: ccipMessage.toCell(),
                root: st.root,
                metadataHash: msg.metadataHash
            }
        });
        executeValidated.send(SEND_MODE_CARRY_ALL_BALANCE);
    }
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

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}
