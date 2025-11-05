import "errors"
import "types"
import "../onramp/messages"

struct CCIPSendExecutor<T> {
    messageID: uint224,
    onrampSend: OnRamp_Send,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: Cell<T>,
    originalBalance: coins,
}

fun CCIPSendExecutor<T>.load(): CCIPSendExecutor<T> {
    val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
    assert (st.state is Cell<T>) throw CCIPSendExecutor_Error.StateNotExpected; // invalid state
    return CCIPSendExecutor<T> {
        messageID: st.messageId,
        onrampSend: st.onrampSend,
        addresses: st.addresses,
        state: st.state,
        originalBalance: st.originalBalance,
    };
}

fun CCIPSendExecutor<T>.store(self) {
    contract.setData(CCIPSendExecutor_Data {
        messageId: 0,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: self.state,
        originalBalance: self.originalBalance,
    }.toCell());
}
