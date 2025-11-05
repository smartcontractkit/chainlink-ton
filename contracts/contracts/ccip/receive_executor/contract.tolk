import "../offramp/types"
import "storage"
import "messages"
import "types"
import "errors"
import "../offramp/messages"
import "../../lib/utils"

const CONTRACT_VERSION = "0.0.3";

fun onInternalMessage(in: InMessage) {
    val msg = lazy ReceiveExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        ReceiveExecutor_InitExecute => {
            _initExecute(msg, in.senderAddress);
        }
        ReceiveExecutor_Confirm => {
            _ccipReceiveConfirm(msg, in.senderAddress);
        }
        ReceiveExecutor_Bounced => {
            _ccipReceiveBounced(msg, in.senderAddress);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun _initExecute(msg: ReceiveExecutor_InitExecute, sender: address) {
    var st = ReceiveExecutor_Storage.load();

    assert(sender == st.owner, Error.Unauthorized);

    //TODO 

    // if tokenAmounts > 0 && state == initial
    // set state = token transfer
    // send message to offramp to ask to release tokens

    // else if no tokenTransfers
    _execute(st);
}

fun _execute(st: ReceiveExecutor_Storage) {
    st.state = ReceiveExecutor_MessageState.Execute;
    st.store();
    createMessage(
        {
            bounce: true,
            value: ton("0.05"),
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: st.message,
                execId: st.execId,
            }
        }
    ).send(SEND_MODE_REGULAR);
}

// Finalizes message execution by returning all balance to the OffRamp and freezing the contract
fun _ccipReceiveConfirm(msg: ReceiveExecutor_Confirm, sender: address) {
    var st = ReceiveExecutor_Storage.load();

    assert(st.state == ReceiveExecutor_MessageState.Execute, Error.UpdatingStateOfNonExecutedMessage);
    assert(sender == st.owner, Error.Unauthorized);

    val ccipMessage = Any2TVMRampMessage.fromCell(st.message);

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = ReceiveExecutor_MessageState.Success;
    st.store();

    val messageHeader = ccipMessage.header;
    val notifySuccess = createMessage({
        bounce: true,
        value: ton("0"),
        dest: st.owner,
        body: OffRamp_NotifySuccess {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifySuccess.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun _ccipReceiveBounced(msg: ReceiveExecutor_Bounced, sender: address){
    var st: ReceiveExecutor_Storage = ReceiveExecutor_Storage.load();

    assert(sender == st.owner, Error.Unauthorized);
    assert(st.state == ReceiveExecutor_MessageState.Execute, Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = Any2TVMRampMessage.fromCell(st.message);

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = ReceiveExecutor_MessageState.ExecuteFailed;
    st.store();

    val messageHeader = ccipMessage.header;
    val notifySuccess = createMessage({
        bounce: true,
        value: ton("0.02"),
        dest: st.owner,
        body: OffRamp_NotifyFailure {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifySuccess.send(SEND_MODE_REGULAR);

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
    return ("com.chainlink.ton.ccip.ReceiveExecutor", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.ReceiveExecutor"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.ReceiveExecutor"), local);
}
