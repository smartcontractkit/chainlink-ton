import "types"
import "../onramp/messages"
import "../fee_quoter/messages"
import "../token_registry/messages"
import "../pools/messages"

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | CCIPSendExecutor_ExecuteV2
    | FeeQuoter_MessageValidated<RemainingBitsAndRefs>
    | FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>
    | TokenRegistry_ReturnTokenInfo
    | TokenPool_NotifySuccessfulLockOrBurn
    ;

// crc32('CCIPSendExecutor_ExecuteV2')
struct (0x09bbeb9e) CCIPSendExecutor_ExecuteV2 {
    onrampSend: OnRamp_Send,
    config: Cell<CCIPSendExecutor_ConfigV2>,
}

//TODO: Deprecate
// crc32('CCIPSendExecutor_Execute')
struct (0xaf3c62b3) CCIPSendExecutor_Execute {
    onrampSend: OnRamp_Send,
    config: Cell<CCIPSendExecutor_Config>,
}

// Costs associated with SendExecutor operations
struct SendExecutor_Costs {}

// Minimum value for deploying SendExecutor
@inline
fun SendExecutor_Costs.Deploy(): int {
    return ton("0.01");
}

// Minimum value for calling SendExecutor_GetValidatedFee
@inline
fun SendExecutor_Costs.Execute(): int {
    val baseFee =
        + ton("0.002") // computeFee
        + ton("0.019") // GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
        + max(SendExecutor_Costs.MessageValidated(), SendExecutor_Costs.MessageValidationFailed())
        ;
    return baseFee;
}

@inline
fun SendExecutor_Costs.MessageValidated(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // ExecutorFinishedSuccessfully fwdFee
        + OnRamp_Costs.ExecutorFinishedSuccessfully();
}

@inline
fun SendExecutor_Costs.MessageValidationFailed(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // ExecutorFinishedWithError fwdFee
        + OnRamp_Costs.ExecutorFinishedWithError();
}

type CCIPSendExecutor_BouncedMessage =
    | FeeQuoter_GetValidatedFee<RemainingBitsAndRefs>
    ;
