import "../types"

tolk 1.0


struct CCIPSendExecutor_InitialData {
    onramp: address,
    messageId: uint224,
}

struct CCIPSendExecutor_Data {
    onramp: address,
    messageId: uint224,
    onrampSend: OnRampSend,
    executionStatus: CCIPSendExecutor_ExecutionStatus,
    config: Cell<CCIPSendExecutor_Config>,
}

struct CCIPSendExecutor_Config {
    feeQuoter: address,
    tokenRegistry: address?,
}

type CCIPSendExecutor_ExecutionStatus =
    | CCIPSendExecutor_WaitingForJettons
    | CCIPSendExecutor_OnGoingFeeValidation
    | CCIPSendExecutor_OnGoingTokenRegistryQuery

struct CCIPSendExecutor_WaitingForJettons {}

struct CCIPSendExecutor_OnGoingFeeValidation {}

struct CCIPSendExecutor_OnGoingTokenRegistryQuery {}
