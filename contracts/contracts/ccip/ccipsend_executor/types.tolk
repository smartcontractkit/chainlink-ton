import "../onramp/messages.tolk";

struct CCIPSendExecutor_InitialData {
    onramp: address,
    messageID: uint224,
}

struct CCIPSendExecutor_Data {
    messageId: uint224,
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

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_Config {
    feeQuoter: address,
}


