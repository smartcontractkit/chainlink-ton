import "../../lib/jetton/messages"

import "../onramp/messages"
import "../fee_quoter/messages"
import "../token_admin_registry_entry/messages"
import "../pools/lib/token_pool/messages"

import "types"

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | FeeQuoter_MessageValidated_Any
    | FeeQuoter_MessageValidationFailed_Any
    | TokenRegistry_ReturnTokenInfo
    | ResponseWalletAddress
    | TokenPool_LockOrBurnWithdraw
    | TokenPool_LockOrBurnFinished;

type FeeQuoter_MessageValidated_Any = FeeQuoter_MessageValidated<RemainingBitsAndRefs>
type FeeQuoter_MessageValidationFailed_Any = FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>

// crc32('CCIPSendExecutor_Execute')
struct (0xaf3c62b3) CCIPSendExecutor_Execute {
    onrampSend: OnRamp_Send,
    // Derived by the OnRamp rather than supplied by the Router.
    tokenRegistry: address?,
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
    return
        ton("0.002") // computeFee
        + ton("0.019") // GetValidatedFee fwdFee
        + FeeQuoter_Costs.GetValidatedFee()
        + max(SendExecutor_Costs.MessageValidated(), SendExecutor_Costs.MessageValidationFailed())
        //TODO: estimate correct gas needed here
        + ton("0.2"); // overhead for token transfers
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
