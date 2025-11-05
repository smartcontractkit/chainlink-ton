import "../onramp/messages.tolk";

struct CCIPSendExecutor_InitialData {
    onramp: address,
    messageId: uint224,
}

struct CCIPSendExecutor_Data {
    messageId: uint224,
    onrampSend: OnRamp_Send,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: CCIPSendExecutor_State,
    originalBalance: coins,
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

struct CCIPSendExecutor_Config {
    feeQuoter: address,
    tokenRegistry: address?,
}

// TODO
// struct CCIPSendExecutor_State_OnGoingLockOrBurn {
// }

// Casted state


