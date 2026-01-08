import "../offramp/types"
import "storage"
import "messages"
import "types"
import "errors"
import "../offramp/messages"
import "../../lib/utils"

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy ReceiveExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_InitExecute => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, Error.Unauthorized);
            onInitExecute(mutate st, msg);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_Confirm => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, Error.Unauthorized);
            onCCIPReceiveConfirm(mutate st, msg);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_Bounced => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, Error.Unauthorized);
            onCCIPReceiveBounced(mutate st, msg);
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onInitExecute(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_InitExecute) {
    st.lastExecutionTimestamp = blockchain.now();
    execute(mutate st, msg.gasOverride);
}

fun execute(mutate st: ReceiveExecutor_Storage, gasOverride: coins?) {
    st.state = ReceiveExecutor_MessageState.Execute;
    createMessage(
        {
            bounce: true,
            value: 0,
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: st.message,
                execId: st.execId,
                gasOverride,
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Finalizes message execution by returning all balance to the OffRamp and freezing the contract
fun onCCIPReceiveConfirm(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_Confirm) {
    assert(st.state == ReceiveExecutor_MessageState.Execute, Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = Any2TVMRampMessage.fromCell(st.message);

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = ReceiveExecutor_MessageState.Success;

    val messageHeader = ccipMessage.header;
    val notifySuccess = createMessage({
        bounce: true,
        value: 0,
        dest: st.owner,
        body: OffRamp_NotifySuccess {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifySuccess.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun onCCIPReceiveBounced(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_Bounced){
    assert(st.state == ReceiveExecutor_MessageState.Execute, Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = Any2TVMRampMessage.fromCell(st.message);

    assert (msg.receiver == ccipMessage.receiver, Error.NotificationFromInvalidReceiver);

    st.state = ReceiveExecutor_MessageState.ExecuteFailed;

    val messageHeader = ccipMessage.header;
    val notifyFailure = createMessage({
        bounce: true,
        value: 0,
        dest: st.owner,
        body: OffRamp_NotifyFailure {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifyFailure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.ReceiveExecutor", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.ReceiveExecutor"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.ReceiveExecutor"), local);
}
