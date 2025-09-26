import "../types"
import "errors"

tolk 1.1


struct CCIPSendExecutor_InitialData {
    onramp: address,
    messageId: uint224,
}

struct CCIPSendExecutor_Data {
    messageId: uint224,
    onrampSend: OnRampSend,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: CCIPSendExecutor_State,
}

struct CCIPSendExecutor_Addresses {
    onramp: address,
    feeQuoter: address,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_WaitingForJettons>
    // TODO | Cell<CCIPSendExecutor_State_OnGoingTokenRegistryQuery>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>
    // TODO | Cell<CCIPSendExecutor_State_OnGoingLockOrBurn>

struct CCIPSendExecutor_State_Initialized {
    tokenRegistry: address?,
}

struct CCIPSendExecutor_State_WaitingForJettons {
    tokenRegistry: address,
}

// TODO
// struct CCIPSendExecutor_State_OnGoingTokenRegistryQuery {
//     tokenRegistry: address,
//     jettonWallet: address,
// }

struct CCIPSendExecutor_State_OnGoingFeeValidation {
    pendingJettonLock: CCIPSendExecutor_PendingJettonLock?
}

struct CCIPSendExecutor_PendingJettonLock {
    tokenRegistry: address,
    jettonWallet: address,
    tokenPool: address,
}

// TODO
// struct CCIPSendExecutor_State_OnGoingLockOrBurn {
// }

// Casted state

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