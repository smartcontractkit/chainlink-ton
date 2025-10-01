import "../types"
import "errors"
import "types"

struct CCIPSendExecutor<T> {
    messageId: uint224,
    onrampSend: OnRampSend,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: Cell<T>,
}

fun CCIPSendExecutor<T>.load(): CCIPSendExecutor<T> {
    val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
    assert (st.state is Cell<T>) throw CCIPSEND_EXECUTOR_ERROR_STATE_NOT_EXPECTED; // invalid state
    return CCIPSendExecutor<T> {
        messageId: st.messageId,
        onrampSend: st.onrampSend,
        addresses: st.addresses,
        state: st.state,
    };
}

fun CCIPSendExecutor<T>.store(self) {
    contract.setData(CCIPSendExecutor_Data {
        messageId: 0,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: self.state,
    }.toCell());
}
