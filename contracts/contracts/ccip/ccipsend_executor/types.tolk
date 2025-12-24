import "../onramp/messages.tolk";
import "../../deployable/types"
import "../../lib/deployable/namespace"

type CCIPSendExecutor_ID = uint224

struct CCIPSendExecutor_InitialData {
    onramp: address,
    id: CCIPSendExecutor_ID,
}

struct CCIPSendExecutor_Data {
    id: CCIPSendExecutor_ID,
    onrampSend: OnRamp_Send,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: CCIPSendExecutor_State,
}

struct CCIPSendExecutor_Addresses {
    onramp: address,
    feeQuoter: address,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>
    | Cell<CCIPSendExecutor_State_Finalized>

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_State_Finalized {
}

struct CCIPSendExecutor_Config {
    feeQuoter: address,
}


